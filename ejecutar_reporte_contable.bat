@echo off
title Orquestador de Reportes Contables - Fincontrol
cls
echo =========================================================================
echo  FINCONTROL - GENERADOR DE REPORTES CONTABLES (MAESTROS Y CS)
echo =========================================================================
echo.
set /p MES="Ingresa el MES a procesar (ejemplo: JULIO): "
if "%MES%"=="" set MES=JUNIO

set /p ANIO="Ingresa el ANIO (ejemplo: 2026): "
if "%ANIO%"=="" set ANIO=2026

echo.
echo --> Procesando reportes contables para %MES% %ANIO%...
echo.

py generar_reporte_contable_orquestador.py %MES% %ANIO%

echo.
echo =========================================================================
echo  PROCESO FINALIZADO. Abre o refresca Fincontrol para ver el dashboard.
echo =========================================================================
echo.
pause
