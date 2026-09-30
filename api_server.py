import os
import sys
import json
import base64
import subprocess
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler

class FinControlAPIHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        if self.path in ['/', '/health', '/api/health']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "service": "fincontrol-api",
                "version": "1.0.0-cloud-run"
            }).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

    def do_POST(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))

        if self.path == '/api/procesar':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                mes = data.get('mes', 'SEPTIEMBRE').upper()
                anio = str(data.get('anio', '2026'))
                modo = data.get('modo', 'ambos')
                
                # 1. Guardar archivo de Ventas (si viene en el payload)
                ventas_b64 = data.get('ventas_b64', None)
                ventas_filename = data.get('ventas_filename', f'Consolidado de ventas {mes.capitalize()} {anio}.xlsx')
                if modo in ['externo', 'ambos'] and ventas_b64:
                    sales_dir = os.path.join(base_dir, 'CONSOLIDADO DE VENTAS')
                    os.makedirs(sales_dir, exist_ok=True)
                    sales_path = os.path.join(sales_dir, ventas_filename)
                    with open(sales_path, "wb") as fh:
                        fh.write(base64.b64decode(ventas_b64))
                    print(f"[*] Archivo de ventas guardado en: {sales_path}")

                # 2. Guardar archivo de OTs CS (si viene en el payload desde la web)
                ot_cs_b64 = data.get('ot_cs_b64', None)
                ot_cs_filename = data.get('ot_cs_filename', f'ESTADO DE OT {mes}.xlsx')
                if ot_cs_b64:
                    cs_dir = os.path.join(base_dir, 'DATA_ONEDRIVE', 'TALLER DE SERVICIO', 'OT', 'ESTADO DE OT', '2026', mes)
                    os.makedirs(cs_dir, exist_ok=True)
                    cs_path = os.path.join(cs_dir, ot_cs_filename)
                    with open(cs_path, "wb") as fh:
                        fh.write(base64.b64decode(ot_cs_b64))
                    print(f"[*] Archivo de OTs CS guardado en: {cs_path}")
                    os.environ['OT_CS_DIR'] = os.path.join(base_dir, 'DATA_ONEDRIVE', 'TALLER DE SERVICIO', 'OT', 'ESTADO DE OT', '2026')
                    os.environ['ONEDRIVE_DIR'] = os.path.join(base_dir, 'DATA_ONEDRIVE')

                # 3. Guardar archivo de OTs MAESTROS (si viene en el payload)
                ot_m_b64 = data.get('ot_m_b64', None)
                ot_m_filename = data.get('ot_m_filename', f'ESTADO DE OT MAESTROS {mes}.xlsx')
                if ot_m_b64:
                    m_dir = os.path.join(base_dir, 'DATA_ONEDRIVE', 'MAESTROS', 'OT', '2026', mes)
                    os.makedirs(m_dir, exist_ok=True)
                    m_path = os.path.join(m_dir, ot_m_filename)
                    with open(m_path, "wb") as fh:
                        fh.write(base64.b64decode(ot_m_b64))
                    print(f"[*] Archivo de OTs MAESTROS guardado en: {m_path}")
                    os.environ['OT_MAESTROS_DIR'] = os.path.join(base_dir, 'DATA_ONEDRIVE', 'MAESTROS', 'OT', '2026')
                    os.environ['ONEDRIVE_DIR'] = os.path.join(base_dir, 'DATA_ONEDRIVE')

                # 4. Ejecutar el script procesar_reportes_completo.py
                script_path = os.path.join(base_dir, 'procesar_reportes_completo.py')
                print(f"[*] Ejecutando: python {script_path} {mes} {anio} --modo {modo}")
                
                result = subprocess.run(
                    [sys.executable, script_path, mes, anio, '--modo', modo],
                    capture_output=True,
                    text=True,
                    cwd=base_dir
                )
                
                if result.returncode == 0:
                    # Leer datos generados
                    js_path = os.path.join(base_dir, "datos_reporte_contable.js")
                    data_obj = None
                    if os.path.exists(js_path):
                        with open(js_path, "r", encoding="utf-8") as f:
                            js_content = f.read()
                            json_str = js_content.replace('// datos_reporte_contable.js', '').replace('window.REPORTE_CONTABLE_DATA = ', '').strip()
                            if json_str.endswith(';'): json_str = json_str[:-1]
                            data_obj = json.loads(json_str)

                    # Adjuntar libros Excel generados en Base64 para descarga directa en navegador
                    excel_cs_b64 = None
                    excel_cs_name = f"REPORTE_COSTO_SERVICIOS_CS_{mes}_{anio}_FINAL_FINCONTROL.xlsx"
                    excel_cs_path = os.path.join(base_dir, "FORMATO", "CS", excel_cs_name)
                    if os.path.exists(excel_cs_path):
                        with open(excel_cs_path, "rb") as ef:
                            excel_cs_b64 = base64.b64encode(ef.read()).decode('utf-8')

                    excel_m_b64 = None
                    excel_m_name = f"REPORTE_COSTO_SERVICIOS_MAESTROS_{mes}_{anio}_FINAL_FINCONTROL.xlsx"
                    excel_m_path = os.path.join(base_dir, "FORMATO", "MAESTROS", excel_m_name)
                    if os.path.exists(excel_m_path):
                        with open(excel_m_path, "rb") as ef:
                            excel_m_b64 = base64.b64encode(ef.read()).decode('utf-8')

                    response = {
                        "status": "success",
                        "message": f"Reportes generados para {mes} {anio} en modo {modo}",
                        "data": data_obj,
                        "excel_cs_b64": excel_cs_b64,
                        "excel_cs_filename": excel_cs_name,
                        "excel_maestros_b64": excel_m_b64,
                        "excel_maestros_filename": excel_m_name,
                        "output": result.stdout
                    }
                else:
                    response = {
                        "status": "error",
                        "message": "Error al ejecutar el procesamiento contable",
                        "output": result.stderr or result.stdout
                    }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e), "traceback": traceback.format_exc()}).encode('utf-8'))

        elif self.path == '/api/guardar_miscelaneos':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                miscelaneos_actualizados = data.get('miscelaneosList', [])
                output_js_path = os.path.join(base_dir, 'datos_reporte_contable.js')
                if os.path.exists(output_js_path):
                    with open(output_js_path, "r", encoding="utf-8") as f:
                        js_content = f.read()
                        
                    json_str = js_content.replace("// datos_reporte_contable.js", "").replace("window.REPORTE_CONTABLE_DATA = ", "").strip()
                    if json_str.endswith(";"): json_str = json_str[:-1]
                    contable_data = json.loads(json_str)
                    
                    if "csInterno" in contable_data and "registros" in contable_data["csInterno"]:
                        for misc in miscelaneos_actualizados:
                            for reg in contable_data["csInterno"]["registros"]:
                                if str(reg.get("ot")) == str(misc.get("ot")) and str(reg.get("rms")) == str(misc.get("rms")):
                                    reg["montoUSD"] = misc.get("montoUSD")
                                    reg["montoNIO"] = misc.get("montoNIO")
                                    reg["horas"] = misc.get("horas")
                                    break
                    
                    new_js_content = f"// datos_reporte_contable.js\nwindow.REPORTE_CONTABLE_DATA = {json.dumps(contable_data, ensure_ascii=False, indent=2)};\n"
                    with open(output_js_path, "w", encoding="utf-8") as f:
                        f.write(new_js_content)
                    
                    script_excel = os.path.join(base_dir, 'escribir_excel_final.py')
                    if os.path.exists(script_excel):
                        subprocess.run([sys.executable, script_excel])
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ok', 'message': 'Guardado y Excel actualizado'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e), "traceback": traceback.format_exc()}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

def run(server_class=HTTPServer, handler_class=FinControlAPIHandler, port=None):
    if port is None:
        port = int(os.environ.get('PORT', 8081))
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    print(f'[*] Iniciando FinControl API Server en http://0.0.0.0:{port}...')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    print('[*] Servidor detenido.')

if __name__ == '__main__':
    run()
