# 🚀 Guía Oficial: Despliegue de FinControl Backend en Google Cloud Run

Esta guía explica paso a paso cómo desplegar el motor de procesamiento contable de FinControl en **Google Cloud Run (Serverless)** para que tu aplicación web en **GitHub Pages** funcione al 100% desde cualquier computadora, teléfono o tablet, sin depender de que tu computadora personal esté encendida.

---

## 🌟 Beneficios Clave de esta Arquitectura

1. **Escalado a Cero (Costo $0.00 USD):**
   * Google Cloud Run incluye **2 millones de peticiones gratuitas al mes** y 360,000 segundos de CPU gratis.
   * Cuando nadie está usando el generador contable, el servidor se apaga automáticamente y **no consume ni un solo centavo**.
2. **HTTPS Automático:**
   * Google Cloud te entrega un dominio seguro con candado (`https://fincontrol-api-xxxx.a.run.app`).
   * Elimina por completo las restricciones de seguridad (CORS / Mixed Content) en Google Chrome.
3. **Modo Híbrido (Web y PC):**
   * En la web: Puedes arrastrar directamente el archivo Excel de OTs a la **Caja 1** y el de Ventas a la **Caja 2**.
   * En PC local: Sigue funcionando automáticamente leyendo tu OneDrive como siempre.
4. **Descarga Directa en el Navegador:**
   * El reporte Excel generado se transfiere por memoria y se descarga de inmediato al dar clic en **"Descargar Reporte (.xlsx)"**.

---

## 📋 Requisitos Previos (Una sola vez)

1. **Una cuenta de Google Cloud** (puedes usar tu cuenta de Google o corporativa en [console.cloud.google.com](https://console.cloud.google.com/)).
2. **Tener instalado Google Cloud CLI (gcloud):**
   * Si no lo tienes, descárgalo e instálalo desde [aquí](https://cloud.google.com/sdk/docs/install).
3. **Iniciar sesión en tu consola:**
   Abre una terminal (PowerShell o CMD) y escribe:
   ```bash
   gcloud auth login
   ```

---

## ⚡ Paso a Paso para Desplegar (Método Rápido)

### Opción 1: Con el asistente automático (Recomendado)
Simplemente haz doble clic en el archivo:
📁 **`deploy_cloud_run.bat`**

El asistente te pedirá el ID de tu proyecto de Google Cloud (por ejemplo: `mi-empresa-contable`) y se encargará de:
* Habilitar las APIs de Cloud Run y Cloud Build.
* Empaquetar el contenedor Docker con Python 3.11, catálogos e históricos.
* Desplegar el servicio en la región `us-central1` con **2 GB de RAM**.

---

### Opción 2: Desde la línea de comandos manual
Si prefieres hacerlo tú mismo desde PowerShell en la carpeta del proyecto:

```powershell
# 1. Elegir proyecto
gcloud config set project TU_PROJECT_ID

# 2. Desplegar el código fuente directamente a Cloud Run
gcloud run deploy fincontrol-api `
    --source . `
    --platform managed `
    --region us-central1 `
    --allow-unauthenticated `
    --memory 2Gi `
    --timeout 300s `
    --port 8080
```

Al terminar el comando (tarda entre 2 y 3 minutos la primera vez), Cloud Run imprimirá en pantalla tu URL oficial:
```text
Service [fincontrol-api] revision [fincontrol-api-00001-abc] has been deployed and is serving 100 percent of traffic.
Service URL: https://fincontrol-api-xxxx-uc.a.run.app
```

---

## 🔗 Cómo Conectar la URL con GitHub Pages

Una vez que tengas tu URL de Cloud Run (ejemplo: `https://fincontrol-api-xxxx-uc.a.run.app`):

1. **En tu navegador:**
   * Abre la consola de desarrollador (tecla `F12` en Chrome) y escribe:
     ```javascript
     localStorage.setItem('FINCONTROL_API_URL', 'https://fincontrol-api-xxxx-uc.a.run.app');
     ```
   * ¡Listo! A partir de ese momento, cada vez que presiones **"Procesar Archivos"** desde GitHub Pages, la aplicación se comunicará directamente con tu motor en la nube de Google.

---

## 🧪 Cómo Probar que la API está Viva
Solo abre la URL de tu servicio en el navegador (ejemplo: `https://fincontrol-api-xxxx-uc.a.run.app/health`).
Debe responder inmediatamente:
```json
{"status": "ok", "service": "fincontrol-api", "version": "1.0.0-cloud-run"}
```
