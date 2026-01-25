import pygame
import docker
import threading
import os
import time
import math
import sys

# Configuration
IMAGE_NAME = "klschaefer/pantry-kiosk:latest"
CONTAINER_NAME = "pantry-kiosk"

# Environment variables to pass through or defaults
ENV_VARS = {
    "DISPLAY": os.environ.get("DISPLAY", ":0"),
    "URL": os.environ.get("URL", "https://pantry.yourdomain.com"), # Should be overridden
}
# Add MQTT env vars if present
for key in os.environ:
    if key.startswith("MQTT_") or key == "KIOSK_ID":
        ENV_VARS[key] = os.environ[key]

class BootstrapApp:
    def __init__(self):
        pygame.init()
        # Set up the display
        infoObject = pygame.display.Info()
        self.width = infoObject.current_w
        self.height = infoObject.current_h
        
        # Hide mouse cursor
        pygame.mouse.set_visible(False)
        
        self.screen = pygame.display.set_mode((self.width, self.height), pygame.FULLSCREEN)
        pygame.display.set_caption("Pantry Kiosk Bootstrapper")
        
        # Load assets
        self.load_assets()
        
        # State
        self.running = True
        self.status_message = "Initializing..."
        self.progress = 0.0 # 0.0 to 1.0
        self.docker_client = docker.from_env()
        self.error_message = None

    def load_assets(self):
        try:
            bg_path = os.path.join(os.path.dirname(__file__), "assets", "background.png")
            self.bg_image = pygame.image.load(bg_path)
            self.bg_image = pygame.transform.scale(self.bg_image, (self.width, self.height))
        except Exception as e:
            print(f"Could not load background: {e}")
            self.bg_image = None
            
        self.font = pygame.font.SysFont("Arial", 40)
        self.small_font = pygame.font.SysFont("Arial", 24)

    def draw_spinner(self, center_x, center_y, angle):
        radius = 50
        thickness = 5
        color = (255, 255, 255)
        
        # Draw a simple arc or rotating circle elements
        for i in range(8):
            theta = angle + (i * 45)
            rad = math.radians(theta)
            x = center_x + radius * math.cos(rad)
            y = center_y + radius * math.sin(rad)
            alpha = 255 - (i * 30)
            if alpha < 0: alpha = 0
            
            s = pygame.Surface((10, 10), pygame.SRCALPHA)
            pygame.draw.circle(s, (255, 255, 255, alpha), (5, 5), 5)
            self.screen.blit(s, (x - 5, y - 5))

    def run_docker_tasks(self):
        try:
            self.status_message = f"Pulling {IMAGE_NAME}..."
            
            # Pull image
            # We can't easily get precise progress percentage from docker-py high level API easily 
            # without parsing json stream, but for simplicity we'll just indicate work is happening.
            # Using low-level API for progress would be better but high-level is safer.
            # We will use the stream to update text at least.
            
            api_client = docker.APIClient(base_url='unix://var/run/docker.sock')
            layers = {}
            
            for line in api_client.pull(IMAGE_NAME, stream=True, decode=True):
                if 'status' in line:
                    status = line['status']
                    if 'id' in line:
                        id = line['id']
                        if status == 'Downloading' or status == 'Extracting':
                            if 'progressDetail' in line and 'total' in line['progressDetail'] and 'current' in line['progressDetail']:
                                current = line['progressDetail']['current']
                                total = line['progressDetail']['total']
                                layers[id] = current / total
                        elif status == "Pull complete":
                            layers[id] = 1.0
                    
                    # Calculate average progress
                    if layers:
                        avg_progress = sum(layers.values()) / len(layers)
                        self.progress = avg_progress
                        self.status_message = f"Pulling... {int(self.progress * 100)}%"
                    else:
                        self.status_message = status

            self.status_message = "Starting Kiosk..."
            self.progress = 1.0
            
            # Check for existing container
            try:
                old_container = self.docker_client.containers.get(CONTAINER_NAME)
                self.status_message = "Removing old container..."
                old_container.stop(timeout=5)
                old_container.remove()
            except docker.errors.NotFound:
                pass
            
            # Run new container
            # We replicate the arguments from the README
            # docker run --rm \
            #   --name pantry-kiosk \
            #   -v /tmp/.X11-unix:/tmp/.X11-unix \
            #   -v /dev/bus/usb:/dev/bus/usb \
            #   -v /dev/input:/dev/input \
            #   -v pantry_data:/data \
            #   -v /etc/localtime:/etc/localtime:ro \
            #   -v /etc/timezone:/etc/timezone:ro \
            #   --device /dev/snd \
            #   --privileged \
            #   -e DISPLAY=:0 \
            #   -e URL="https://pantry.yourdomain.com" \
            #   --ipc=host \
            #   klschaefer/pantry-kiosk:latest
            
            # Note: We need to map volumes that exist on the HOST. 
            # Since this script runs INSIDE a docker container, the paths /dev/bus/usb etc 
            # must be accessible to THIS container too, OR we are just commanding the host docker daemon.
            # We are commanding the host docker daemon. So the paths refer to HOST paths.
            
            self.docker_client.containers.run(
                IMAGE_NAME,
                name=CONTAINER_NAME,
                detach=True,
                remove=True,
                privileged=True,
                ipc_mode="host",
                environment=ENV_VARS,
                volumes={
                    '/tmp/.X11-unix': {'bind': '/tmp/.X11-unix', 'mode': 'rw'},
                    '/dev/bus/usb': {'bind': '/dev/bus/usb', 'mode': 'rw'},
                    '/dev/input': {'bind': '/dev/input', 'mode': 'rw'},
                    'pantry_data': {'bind': '/data', 'mode': 'rw'},
                    '/etc/localtime': {'bind': '/etc/localtime', 'mode': 'ro'},
                    '/etc/timezone': {'bind': '/etc/timezone', 'mode': 'ro'}
                },
                devices=['/dev/snd:/dev/snd']
            )
            
            self.status_message = "Done!"
            time.sleep(2) 
            self.running = False
            
        except Exception as e:
            print(f"Error: {e}")
            self.error_message = str(e)
            time.sleep(10) # process will exit, maybe restart policy will retry
            self.running = False


    def run(self):
        # Start docker thread
        t = threading.Thread(target=self.run_docker_tasks)
        t.daemon = True
        t.start()
        
        clock = pygame.time.Clock()
        angle = 0
        
        while self.running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        self.running = False

            # Draw Background
            if self.bg_image:
                self.screen.blit(self.bg_image, (0, 0))
            else:
                self.screen.fill((20, 20, 20))
                
            # Draw Overlay (Semi-transparent dark box)
            s = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
            pygame.draw.rect(s, (0, 0, 0, 150), (0, 0, self.width, self.height))
            self.screen.blit(s, (0, 0))
            
            # Center coordinates
            cx, cy = self.width // 2, self.height // 2
            
            # Draw Spinner
            self.draw_spinner(cx, cy - 50, angle)
            angle += 5
            
            # Draw Status Text
            text = self.font.render(self.status_message, True, (255, 255, 255))
            text_rect = text.get_rect(center=(cx, cy + 50))
            self.screen.blit(text, text_rect)
            
            # Draw Progress Bar
            if self.progress > 0:
                bar_width = 400
                bar_height = 10
                pygame.draw.rect(self.screen, (50, 50, 50), (cx - bar_width//2, cy + 100, bar_width, bar_height))
                pygame.draw.rect(self.screen, (0, 200, 255), (cx - bar_width//2, cy + 100, bar_width * self.progress, bar_height))
            
            if self.error_message:
                err_text = self.small_font.render(f"Error: {self.error_message}", True, (255, 100, 100))
                err_rect = err_text.get_rect(center=(cx, cy + 150))
                self.screen.blit(err_text, err_rect)

            pygame.display.flip()
            clock.tick(60)

        pygame.quit()
        sys.exit(0)

if __name__ == "__main__":
    BootstrapApp().run()
