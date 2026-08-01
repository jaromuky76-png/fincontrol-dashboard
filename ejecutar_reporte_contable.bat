@echo off
title Orquestador de Reportes Contables - Fincontrol
cls
echo =========================================================================
echo  FINCONTROL - GENERADOR Y PROCESADOR DE REPORTES CONTABLES (MAESTROS Y CS)
echo =========================================================================
echo.
set /p MES="Ingresa el MES a procesar (ejemplo: JULIO): "
if "%MES%"=="" set MES=JULIO

set /p ANIO="Ingresa el ANIO (ejemplo: 2026): "
if "%ANIO%"=="" set ANIO=2026

echo.
echo --> Procesando reportes contables desde archivos fuente para %MES% %ANIO%...
echo.

py procesar_reportes_completo.py %MES% %ANIO%

echo.
echo =========================================================================
echo  [OK] PROCESO FINALIZADO EXITOSAMENTE.
echo  Abriendo Fincontrol en tu navegador...
echo =========================================================================
echo.
start "" "https://jaromuky76-png.github.io/fincontrol-dashboard/"
pause
