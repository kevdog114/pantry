import os
import sys
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

# Load bootstrapper version
try:
    with open('/app/version.json', 'r') as f:
        bootstrapper_version = json.load(f)
except Exception:
    bootstrapper_version = {'version': 'unknown', 'buildDate': 'unknown'}

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/version')
def version():
    return json.dumps(bootstrapper_version)

def update_progress(status, percent=None):
    global progress_state
    progress_state['status'] = status
    if percent is not None:
        progress_state['percent'] = percent
    
    socketio.emit('progress', progress_state)

def pull_image_task():
    """Background task to pull the docker image and emit progress."""
    time.sleep(2)

    max_retries = 3
    retry_delay = 5

    for attempt in range(1, max_retries + 1):
        try:
            update_progress("Connecting to Docker...")
            client = docker.from_env()

            update_progress(f"Checking for updates: {IMAGE_TO_PULL}")

            layers = {}

            for line in client.api.pull(IMAGE_TO_PULL, stream=True, decode=True):
                status = line.get('status', '')
                layer_id = line.get('id')

                if status == 'Downloading' or status == 'Extracting':
                    progress_detail = line.get('progressDetail', {})
                    current = progress_detail.get('current', 0)
                    total = progress_detail.get('total', 1)

                    if layer_id:
                        layers[layer_id] = {
                            'status': status,
                            'current': current,
                            'total': total
                        }

                    total_bytes = 0
                    current_bytes = 0
                    for l in layers.values():
                        if l['total'] > 1:
                            total_bytes += l['total']
                            current_bytes += l['current']

                    overall_percent = 0
                    if total_bytes > 0:
                        overall_percent = int((current_bytes / total_bytes) * 100)

                    if overall_percent < progress_state['percent']:
                        overall_percent = progress_state['percent']

                    layer_num = len(layers)
                    update_progress(f"{status} layers ({layer_num})", overall_percent)

                elif status == 'Pull complete':
                    if layer_id and layer_id in layers:
                        layers[layer_id]['current'] = layers[layer_id]['total']
                        total_bytes = 0
                        current_bytes = 0
                        for l in layers.values():
                            total_bytes += l['total']
                            current_bytes += l['current']
                        pct = int((current_bytes / total_bytes) * 100) if total_bytes > 0 else 0
                        if pct < progress_state['percent']:
                            pct = progress_state['percent']
                        update_progress("Finalizing...", pct)

                elif status.startswith('Digest:'):
                    update_progress("Verifying...", 100)

                elif status.startswith('Status: Image is up to date'):
                    update_progress("Already up to date!", 100)

                elif status.startswith('Status: Downloaded newer image'):
                    update_progress("Update downloaded!", 100)

            update_progress("Launching Application...", 100)

            target_version = {'version': 'unknown', 'buildDate': 'unknown'}
            try:
                container = client.containers.run(IMAGE_TO_PULL, 'cat /app/version.json', remove=True)
                target_version = json.loads(container.stdout.decode('utf-8'))
            except Exception:
                pass

            time.sleep(1)
            socketio.emit('finished', {
                'targetVersion': target_version,
                'bootstrapperVersion': bootstrapper_version
            })

            time.sleep(2)
            os._exit(0)

        except Exception as e:
            update_progress(f"Error: {str(e)}")
            print(f"Error pulling image (attempt {attempt}/{max_retries}): {e}")
            if attempt < max_retries:
                update_progress(f"Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                progress_state['percent'] = 0
                progress_state['layers'] = {}
            else:
                time.sleep(5)
                os._exit(1)

@socketio.on('connect')
def test_connect():
    emit('progress', progress_state)

if __name__ == '__main__':
    # Start the background thread
    threading.Thread(target=pull_image_task).start()
    socketio.run(app, host='0.0.0.0', port=5000)
