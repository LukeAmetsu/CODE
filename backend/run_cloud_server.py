"""
Servidor Online / Nuvem para Base de Quantitativos e Orçamentos de Fundações
Permite acesso simultâneo de diferentes membros da equipe de engenharia via rede/navegador.
"""
import sys
import os
import socket

# Ensure root path is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.server import app

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    local_ip = get_local_ip()

    print("=" * 70)
    print(" 🚀 SERVIDOR DE QUANTITATIVOS & ORÇAMENTOS DE ENGENHARIA")
    print("    Fundações de Termelétricas (UTE) & Linhas de Transmissão (LT)")
    print("=" * 70)
    print(f" • Acesso Local (este computador): http://localhost:{port}/gui/takeoff_database.html")
    print(f" • Acesso da Equipe (Rede Local):  http://{local_ip}:{port}/gui/takeoff_database.html")
    print(f" • Hub Geral de Ferramentas:       http://localhost:{port}/gui/index.html")
    print("=" * 70)
    print(" Pressione Ctrl+C para encerrar o servidor.\n")

    # Host 0.0.0.0 allows any team member on the intranet/VPN to connect
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
