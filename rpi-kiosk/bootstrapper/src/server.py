import os
import threading
import time
import json
import docker
from flask import Flask, render_template, send_from_directory
from flask_socketio import SocketIO, emit

# Configuration
IMAGE_TO_PULL = os.environ.get('TARGET_IMAGE', 'klschaefer/pantry-kiosk:latest')

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# Global state
progress_state = {
    'status': 'Initializing...',
    'percent': 0,
    'layers': {}
}

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

def update_progress(status, percent=None):
    global progress_state
    progress_state['status'] = status
    if percent is not None:
        progress_state['percent'] = percent
    
    socketio.emit('progress', progress_state)

def pull_image_task():
    """Background task to pull the docker image and emit progress."""
    time.sleep(2) # Give UI time to connect
    
    try:
        update_progress(f"Connecting to Docker...")
        client = docker.from_env()
        
        update_progress(f"Checking for updates: {IMAGE_TO_PULL}")
        
        layers = {}
        
        # Pull the image with streaming output
        # decode=True returns a generator of dicts
        for line in client.api.pull(IMAGE_TO_PULL, stream=True, decode=True):
            status = line.get('status', '')
            layer_id = line.get('id')
            
            # Handle different docker status messages
            if status == 'Downloading' or status == 'Extracting':
                progress_detail = line.get('progressDetail', {})
                current = progress_detail.get('current', 0)
                total = progress_detail.get('total', 1) # avoid div by zero
                
                if layer_id:
                    layers[layer_id] = {
                        'status': status,
                        'current': current,
                        'total': total
                    }
                
                # Calculate aggregate percentage
                # logic: average percentage of all active layers? 
                # Or just sum current / sum total of all known layers?
                total_bytes = 0
                current_bytes = 0
                for l in layers.values():
                    if l['total'] > 1:
                        total_bytes += l['total']
                        current_bytes += l['current']
                
                overall_percent = 0
                if total_bytes > 0:
                    overall_percent = int((current_bytes / total_bytes) * 100)
                
                update_progress(f"{status} {layer_id or ''}", overall_percent)
                
            elif status == 'Pull complete':
                 if layer_id and layer_id in layers:
                     layers[layer_id]['current'] = layers[layer_id]['total']
                     # Recalculate
                     total_bytes = 0
                     current_bytes = 0
                     for l in layers.values():
                        total_bytes += l['total']
                        current_bytes += l['current']
                     if total_bytes > 0:
                        update_progress("Finalizing...", int((current_bytes / total_bytes) * 100))
            
            elif status.startswith('Digest:'):
                update_progress("Verifying...", 100)
            
            elif status.startswith('Status: Image is up to date'):
                update_progress("Already up to date!", 100)
                
            elif status.startswith('Status: Downloaded newer image'):
                update_progress("Update downloaded!", 100)

        update_progress("Launching Application...", 100)
        time.sleep(1)
        socketio.emit('finished', {})
        
        # Keep server alive briefly then exit to allow container to stop
        # Actually, we rely on the host script to kill us? 
        # Or we can exit the process. 
        # If we exit, the entrypoint script finishes? 
        # The entrypoint runs python & chromium.
        # If python exits, chromium stays running?
        # We should probably sys.exit()
        time.sleep(2)
        os._exit(0) 

    except Exception as e:
        update_progress(f"Error: {str(e)}")
        print(f"Error pulling image: {e}")
        # Build might fail if socket not mounted, etc.
        # Retry?
        time.sleep(5)
        os._exit(1)

@socketio.on('connect')
def test_connect():
    emit('progress', progress_state)

if __name__ == '__main__':
    # Start the background thread
    threading.Thread(target=pull_image_task).start()
    socketio.run(app, host='0.0.0.0', port=5000)
