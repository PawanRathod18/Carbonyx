import os
import signal
import socket
import subprocess
import sys
import threading
import webbrowser

VERSION = "5.3"
PORT = 8000

def kill_port_squatters(port: int):
    me = os.getpid()
    try:
        if sys.platform == "win32":
            out = subprocess.run(["netstat", "-aon"], capture_output=True,
                                 text=True).stdout
            pids = set()
            for line in out.splitlines():
                parts = line.split()
                if (len(parts) >= 5 and parts[-2].upper() == "LISTENING"
                        and parts[1].endswith(f":{port}")):
                    pids.add(parts[-1])
            for pid in pids:
                if pid.isdigit() and int(pid) != me:
                    subprocess.run(["taskkill", "/PID", pid, "/F"],
                                   capture_output=True)
                    print(f"[i] freed port {port} from old server (PID {pid})")
        else:
            out = subprocess.run(["lsof", "-t", f"-i:{port}"],
                                 capture_output=True, text=True).stdout or ""
            for pid in out.split():
                if pid.isdigit() and int(pid) != me:
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                        print(f"[i] freed port {port} from old server (PID {pid})")
                    except ProcessLookupError:
                        pass
    except Exception:
        pass

def find_free_port(start: int = PORT, tries: int = 20) -> int:
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start

def open_browser(url: str):
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    kill_port_squatters(PORT)
    port = find_free_port()
    url = f"http://localhost:{port}"
    print("=" * 58)
    print(f"  CARBONYX v{VERSION}")
    print(f"  Website : {url}")
    print(f"  API docs: {url}/docs")
    print("  Keep this window OPEN while using the site.")
    print("  Press Ctrl+C here to stop.")
    print("=" * 58)
    threading.Timer(2.5, open_browser, args=(url,)).start()
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=port)
