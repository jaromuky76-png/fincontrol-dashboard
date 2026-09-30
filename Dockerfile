FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api_server.py .
COPY procesar_reportes_completo.py .
COPY escribir_excel_final.py .

COPY FORMATO ./FORMATO/
COPY ["COD MAESTROS", "./COD MAESTROS/"]
COPY ["COD CENTRO DE SERVICIOS", "./COD CENTRO DE SERVICIOS/"]
COPY DATA_ONEDRIVE ./DATA_ONEDRIVE/

EXPOSE 8080

CMD ["python", "-u", "api_server.py"]
