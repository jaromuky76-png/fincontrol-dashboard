import os
import sys
import zipfile
import re
import time
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

print("==========================================================")
print("   FinControl - Módulo Contable de Costeo de Mano de Obra  ")
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

print("\nCargando catálogos de mano de obra...")
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
    print("\nNo se encontró ningún archivo .xlsx en la carpeta CONSOLIDADO DE VENTAS.")
    input("\nPresiona Enter para salir...")
    sys.exit(1)

sales_file = excel_files[0]
filename_base = os.path.basename(sales_file)
print(f"\nProcesando archivo: {filename_base} ({(os.path.getsize(sales_file)/1024/1024):.1f} MB)...")

# 3. Parse Sales File using Zip + XML Regex (Fast & Memory Efficient)
try:
    with zipfile.ZipFile(sales_file, 'r') as z:
        # Load Shared Strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_bytes = z.read('xl/sharedStrings.xml')
            # Extract <si> tags
            si_matches = re.findall(rb'<si>(.*?)</si>', ss_bytes, re.DOTALL)
            for si in si_matches:
                t_matches = re.findall(rb'<t[^>]*>(.*?)</t>', si, re.DOTALL)
                if t_matches:
                    text = b"".join(t_matches).decode('utf-8', errors='ignore')
                    shared_strings.append(text)
                else:
                    shared_strings.append('')

        # Locate Ventas sheet
        sheet_path = 'xl/worksheets/sheet3.xml'
        wb_bytes = z.read('xl/workbook.xml')
        sheet_match = re.search(rb'<sheet[^>]*name="([^"]*venta[^"]*)"[^>]*:id="([^"]+)"', wb_bytes, re.IGNORECASE) or \
                      re.search(rb'<sheet[^>]*:id="([^"]+)"[^>]*name="([^"]*venta[^"]*)"', wb_bytes, re.IGNORECASE)
        
        if sheet_match:
            r_id = sheet_match.group(2) if b'venta' in sheet_match.group(1).lower() else sheet_match.group(1)
            rels_bytes = z.read('xl/_rels/workbook.xml.rels')
            target_match = re.search(rb'Id="' + r_id + rb'"[^>]*Target="([^"]+)"', rels_bytes, re.IGNORECASE)
            if target_match:
                rel_target = target_match.group(1).decode('utf-8')
                sheet_path = 'xl/' + rel_target.lstrip('/').replace('xl/', '')

        if sheet_path not in z.namelist():
            # Pick largest sheet file by size
            sheet_files = [f for f in z.namelist() if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]
            sheet_files.sort(key=lambda f: z.getinfo(f).file_size, reverse=True)
            sheet_path = sheet_files[0] if sheet_files else 'xl/worksheets/sheet3.xml'

        print(f" -> Hoja de ventas identificada: {sheet_path}")
        sheet_bytes = z.read(sheet_path)

        # Match Column Q cells: <c r="Q...">...</c>
        cell_q_regex = re.compile(rb'<c r="Q(\d+)"([^>]*)>(.*?)</c>', re.DOTALL)
        val_regex = re.compile(rb'<v>(.*?)</v>')
        t_attr_regex = re.compile(rb't="([^"]+)"')

        maestros_found = {}
        cs_found = {}
        total_rows = 0
        labor_rows = 0

        for match in cell_q_regex.finditer(sheet_bytes):
            row_idx = match.group(1)
            if row_idx == b'1': continue # Header
            
            total_rows += 1
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

            if code_str in maestros_catalog:
                labor_rows += 1
                if code_str not in maestros_found:
                    maestros_found[code_str] = {'desc': maestros_catalog[code_str], 'count': 0}
                maestros_found[code_str]['count'] += 1

            if code_str in cs_catalog:
                labor_rows += 1
                if code_str not in cs_found:
                    cs_found[code_str] = {'desc': cs_catalog[code_str], 'count': 0}
                cs_found[code_str]['count'] += 1

    print(f"\nProcesamiento completado en {time.time()-t0:.2f} segundos.")
    print(f" -> Filas de ventas analizadas: {total_rows:,}")
    print(f" -> Códigos de Mano de Obra identificados para Maestros (T49): {len(maestros_found)}")
    print(f" -> Códigos de Mano de Obra identificados para Centro de Servicios (T39): {len(cs_found)}")

    # 4. Generate Output Excel Report with 2 columns
    out_wb = openpyxl.Workbook()
    
    # Sheet 1: Maestros T49
    ws1 = out_wb.active
    ws1.title = "Taller Maestro (T49)"
    
    # Header styles
    header_fill_m = PatternFill(start_color="0EA5E9", end_color="0EA5E9", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    code_font = Font(name="Consolas", size=10, bold=True, color="0284C7")
    regular_font = Font(name="Calibri", size=10)
    
    ws1.append(["Código Identificado", "Descripción de la Actividad", "Ocurrencias"])
    for cell in ws1[1]:
        cell.fill = header_fill_m
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for k in sorted(maestros_found.keys(), key=lambda x: maestros_found[x]['desc']):
        ws1.append([k, maestros_found[k]['desc'], maestros_found[k]['count']])

    for r in range(2, ws1.max_row + 1):
        ws1[f"A{r}"].font = code_font
        ws1[f"B{r}"].font = regular_font
        ws1[f"C{r}"].font = regular_font

    ws1.column_dimensions['A'].width = 25
    ws1.column_dimensions['B'].width = 70
    ws1.column_dimensions['C'].width = 15

    # Sheet 2: Centro de Servicios T39
    ws2 = out_wb.create_sheet(title="Centro de Servicios (T39)")
    header_fill_cs = PatternFill(start_color="10B981", end_color="10B981", fill_type="solid")
    code_font_cs = Font(name="Consolas", size=10, bold=True, color="059669")

    ws2.append(["Código Identificado", "Descripción de la Actividad", "Ocurrencias"])
    for cell in ws2[1]:
        cell.fill = header_fill_cs
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for k in sorted(cs_found.keys(), key=lambda x: cs_found[x]['desc']):
        ws2.append([k, cs_found[k]['desc'], cs_found[k]['count']])

    for r in range(2, ws2.max_row + 1):
        ws2[f"A{r}"].font = code_font_cs
        ws2[f"B{r}"].font = regular_font
        ws2[f"C{r}"].font = regular_font

    ws2.column_dimensions['A'].width = 25
    ws2.column_dimensions['B'].width = 70
    ws2.column_dimensions['C'].width = 15

    output_filename = f"Reporte_Mano_de_Obra_{os.path.splitext(filename_base)[0]}.xlsx"
    out_wb.save(output_filename)
    out_wb.close()

    print(f"\n==========================================================")
    print(f"  ¡REPORTE GENERADO CON ÉXITO!")
    print(f"  Archivo guardado: {os.path.abspath(output_filename)}")
    print(f"==========================================================")

    # Open output file automatically
    try:
        os.startfile(os.path.abspath(output_filename))
    except Exception:
        pass

except Exception as e:
    print(f"\nError durante el procesamiento: {e}")
    import traceback
    traceback.print_exc()

input("\nPresiona Enter para cerrar esta ventana...")
