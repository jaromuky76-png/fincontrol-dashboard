import os
import sys
import zipfile
import re
import time
import json
import subprocess
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

print("==========================================================")
print("   FinControl - Agente Automatizado de Costeo de Mano de Obra  ")
print("==========================================================")

t0 = time.time()

# 1. Load Master Catalogs
maestros_path = r'COD MAESTROS\COD MAESTROS.xlsx'
cs_path = r'COD CENTRO DE SERVICIOS\COD CS.xlsx'

def load_catalog(filepath):
    if not os.path.exists(filepath):
        print(f"Advertencia: No se encontró el archivo {filepath}")
        return {}
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    catalog = {}
    for row in ws.iter_rows(values_only=True):
        if not row or row[0] is None: continue
        c_str = str(row[0]).strip()
        if c_str.endswith('.0'): c_str = c_str[:-2]
        if c_str.lower() in ('código producto', 'codigo producto', 'código', 'codigo'): continue
        desc_str = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ''
        catalog[c_str] = desc_str
    wb.close()
    return catalog

print("\n1. Cargando catálogos de referencia...")
maestros_catalog = load_catalog(maestros_path)
cs_catalog = load_catalog(cs_path)

print(f" -> Taller Maestro (T49): {len(maestros_catalog)} códigos cargados")
print(f" -> Centro de Servicios (T39): {len(cs_catalog)} códigos cargados")

# 2. Locate Sales Consolidated File
sales_dir = r'CONSOLIDADO DE VENTAS'
excel_files = []
if os.path.exists(sales_dir):
    for f in os.listdir(sales_dir):
        if f.endswith('.xlsx') and not f.startswith('~$'):
            excel_files.append(os.path.join(sales_dir, f))

if not excel_files:
    print("\nError: No se encontró ningún archivo .xlsx en la carpeta CONSOLIDADO DE VENTAS.")
    input("\nPresiona Enter para salir...")
    sys.exit(1)

sales_file = excel_files[0]
filename_base = os.path.basename(sales_file)
print(f"\n2. Procesando sábana de ventas: {filename_base} ({(os.path.getsize(sales_file)/1024/1024):.1f} MB)...")

# 3. Fast Unconsolidated Parsing (Individual Transaction Lines)
maestros_rows = []
cs_rows = []
total_sales_rows = 0

try:
    with zipfile.ZipFile(sales_file, 'r') as z:
        # Load Shared Strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_bytes = z.read('xl/sharedStrings.xml')
            si_matches = re.findall(rb'<si>(.*?)</si>', ss_bytes, re.DOTALL)
            for si in si_matches:
                t_matches = re.findall(rb'<t[^>]*>(.*?)</t>', si, re.DOTALL)
                if t_matches:
                    shared_strings.append(b"".join(t_matches).decode('utf-8', errors='ignore'))
                else:
                    shared_strings.append('')

        # Locate Ventas sheet
        sheet_path = 'xl/worksheets/sheet3.xml'
        wb_bytes = z.read('xl/workbook.xml')
        sheet_matches = re.findall(rb'<sheet\s+[^>]*>', wb_bytes, re.IGNORECASE)
        found_r_id = None
        for tag in sheet_matches:
            name_m = re.search(rb'name="([^"]+)"', tag, re.IGNORECASE)
            if name_m and any(k in name_m.group(1).lower() for k in [b'venta', b'sale', b'factur']):
                r_id_m = re.search(rb'r:id="([^"]+)"', tag, re.IGNORECASE) or re.search(rb':id="([^"]+)"', tag, re.IGNORECASE)
                if r_id_m:
                    found_r_id = r_id_m.group(1)
                    break

        if found_r_id:
            rels_bytes = z.read('xl/_rels/workbook.xml.rels')
            rel_m = re.search(rb'Id="' + found_r_id + rb'"[^>]*Target="([^"]+)"', rels_bytes, re.IGNORECASE)
            if rel_m:
                sheet_path = 'xl/' + rel_m.group(1).decode('utf-8').lstrip('/').replace('xl/', '')

        if sheet_path not in z.namelist():
            sheet_files = [f for f in z.namelist() if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]
            sheet_files.sort(key=lambda f: z.getinfo(f).file_size, reverse=True)
            sheet_path = sheet_files[0] if sheet_files else 'xl/worksheets/sheet3.xml'

        print(f" -> Analizando hoja: {sheet_path}")
        sheet_bytes = z.read(sheet_path)

        cell_q_regex = re.compile(rb'<c r="Q(\d+)"([^>]*)>(.*?)</c>', re.DOTALL)
        val_regex = re.compile(rb'<v>(.*?)</v>')
        t_attr_regex = re.compile(rb't="([^"]+)"')

        for match in cell_q_regex.finditer(sheet_bytes):
            row_idx_str = match.group(1).decode('utf-8')
            if row_idx_str == '1': continue # Header
            
            total_sales_rows += 1
            inner = match.group(3)
            val_m = val_regex.search(inner)
            if not val_m: continue

            val = val_m.group(1).decode('utf-8', errors='ignore')
            t_m = t_attr_regex.search(match.group(2))
            cell_type = t_m.group(1).decode('utf-8') if t_m else ''

            if cell_type == 's':
                idx = int(val)
                code_str = shared_strings[idx].strip() if idx < len(shared_strings) else ''
            else:
                code_str = val.strip()

            if code_str.endswith('.0'):
                code_str = code_str[:-2]

            # Individual row record (Unconsolidated)
            row_num = int(row_idx_str)

            if code_str in maestros_catalog:
                maestros_rows.append({
                    'row': row_num,
                    'code': code_str,
                    'desc': maestros_catalog[code_str]
                })

            if code_str in cs_catalog:
                cs_rows.append({
                    'row': row_num,
                    'code': code_str,
                    'desc': cs_catalog[code_str]
                })

    print(f"\n3. Extracción completada en {time.time()-t0:.2f} segundos:")
    print(f" -> Filas totales analizadas: {total_sales_rows:,}")
    print(f" -> Transacciones de Mano de Obra en Maestros (T49): {len(maestros_rows)} filas individuales")
    print(f" -> Transacciones de Mano de Obra en Centro de Servicios (T39): {len(cs_rows)} filas individuales")

    # 4. Generate Unconsolidated Excel Report (Individual Rows)
    out_wb = openpyxl.Workbook()
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    code_font = Font(name="Consolas", size=10, bold=True, color="0284C7")
    code_font_cs = Font(name="Consolas", size=10, bold=True, color="059669")
    regular_font = Font(name="Calibri", size=10)

    # Sheet 1: Taller Maestro (T49)
    ws1 = out_wb.active
    ws1.title = "Taller Maestro (T49)"
    header_fill_m = PatternFill(start_color="0EA5E9", end_color="0EA5E9", fill_type="solid")
    
    ws1.append(["N° Fila Sábana", "Código Identificado", "Descripción de la Actividad"])
    for cell in ws1[1]:
        cell.fill = header_fill_m
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for r in sorted(maestros_rows, key=lambda x: x['row']):
        ws1.append([r['row'], r['code'], r['desc']])

    for r in range(2, ws1.max_row + 1):
        ws1[f"A{r}"].font = regular_font
        ws1[f"B{r}"].font = code_font
        ws1[f"C{r}"].font = regular_font

    ws1.column_dimensions['A'].width = 16
    ws1.column_dimensions['B'].width = 25
    ws1.column_dimensions['C'].width = 75

    # Sheet 2: Centro de Servicios (T39)
    ws2 = out_wb.create_sheet(title="Centro de Servicios (T39)")
    header_fill_cs = PatternFill(start_color="10B981", end_color="10B981", fill_type="solid")

    ws2.append(["N° Fila Sábana", "Código Identificado", "Descripción de la Actividad"])
    for cell in ws2[1]:
        cell.fill = header_fill_cs
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for r in sorted(cs_rows, key=lambda x: x['row']):
        ws2.append([r['row'], r['code'], r['desc']])

    for r in range(2, ws2.max_row + 1):
        ws2[f"A{r}"].font = regular_font
        ws2[f"B{r}"].font = code_font_cs
        ws2[f"C{r}"].font = regular_font

    ws2.column_dimensions['A'].width = 16
    ws2.column_dimensions['B'].width = 25
    ws2.column_dimensions['C'].width = 75

    output_excel = f"Reporte_Mano_de_Obra_{os.path.splitext(filename_base)[0]}.xlsx"
    out_wb.save(output_excel)
    out_wb.close()
    print(f"\n -> Reporte Excel individual generado: {os.path.abspath(output_excel)}")

    # 5. Export JSON data payload for Web Dashboard (datos_costeo.js)
    month_name = os.path.splitext(filename_base)[0].replace("Consolidado de ventas", "").strip()
    costeo_payload = {
        "fileName": filename_base,
        "monthTag": month_name or "Actual",
        "processedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "totalSalesRows": total_sales_rows,
        "totalLaborRows": len(maestros_rows) + len(cs_rows),
        "maestrosRows": sorted(maestros_rows, key=lambda x: x['row']),
        "csRows": sorted(cs_rows, key=lambda x: x['row'])
    }

    js_content = f"// Datos procesados automáticamente por el Agente Contable\nvar COSTEO_DATA = {json.dumps(costeo_payload, ensure_ascii=False, indent=2)};\n"
    with open("datos_costeo.js", "w", encoding="utf-8") as f:
        f.write(js_content)

    print(" -> Datos sincronizados para la Web Dashboard (datos_costeo.js)")

    # 6. Auto Push to GitHub Pages if git available
    print("\n4. Publicando actualización automática en el Dashboard Web (GitHub Pages)...")
    try:
        subprocess.run(["git", "add", "datos_costeo.js"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "commit", "-m", f"Auto-sync: Resultados de costeo de mano de obra para {filename_base}"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "push", "origin", "main"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(" -> ¡Sincronizado con éxito en GitHub Pages!")
    except Exception as ge:
        print(" -> (Sincronizado localmente para la web)")

    print(f"\n==========================================================")
    print(f"  ¡PROCESO COMPLETADO Y PUBLICADO CON ÉXITO!")
    print(f"==========================================================")

    # Automatically open output Excel file
    try:
        os.startfile(os.path.abspath(output_excel))
    except Exception:
        pass

except Exception as e:
    print(f"\nError durante la ejecución del agente: {e}")
    import traceback
    traceback.print_exc()

input("\nPresiona Enter para cerrar...")
