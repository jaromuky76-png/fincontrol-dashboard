@echo off
title Desplegador a Google Cloud Run - FinControl Backend
cls
echo =========================================================================
echo       DESPLIEGUE DE FINCONTROL API A GOOGLE CLOUD RUN (SERVERLESS)
echo =========================================================================
echo.
echo Proyecto detectado en tu cuenta: project-eda4a9e8-b60c-4eee-9b1 (My First Project)
echo.
set /p PROJECT_ID="Presiona ENTER para usar este proyecto (o escribe otro ID): "
if "%PROJECT_ID%"=="" set PROJECT_ID=project-eda4a9e8-b60c-4eee-9b1

echo.
echo [*] Configurando proyecto activo: %PROJECT_ID%...
call gcloud config set project %PROJECT_ID%

echo.
echo [*] Desplegando servicio 'fincontrol-api' en Cloud Run (region us-central1)...
echo     Memoria: 2Gi | CPU: 1 | Timeout: 300s | Acceso publico HTTPS
echo.
call gcloud run deploy fincontrol-api ^
    --source . ^
    --project %PROJECT_ID% ^
    --platform managed ^
    --region us-central1 ^
    --allow-unauthenticated ^
    --memory 2Gi ^
    --timeout 300s ^
    --port 8080

echo.
echo =========================================================================
echo  [OK] DESPLIEGUE FINALIZADO.
echo =========================================================================
echo.
pause
