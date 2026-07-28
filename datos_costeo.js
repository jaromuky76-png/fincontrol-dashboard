// Base de datos histórica acumulada de costeo de mano de obra
var COSTEO_HISTORY = {
  "Junio 2026": {
    "fileName": "Consolidado de ventas Junio 2026.xlsx",
    "monthTag": "Junio 2026",
    "processedAt": "2026-07-27 19:19:26",
    "totalSalesRows": 347388,
    "totalLaborRows": 255,
    "maestrosMatches": [
      {
        "code": "101026007",
        "desc": "INSTALACION AIRE ACONDICIONADO",
        "frequency": 56
      },
      {
        "code": "101025389",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE DIAGNOSTICO",
        "frequency": 51
      },
      {
        "code": "145518214",
        "desc": "VISITA WHATSAPP PARA FUTURA INSTALACION DE AIRE ACONDICIONADO",
        "frequency": 11
      },
      {
        "code": "101026031",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO",
        "frequency": 8
      },
      {
        "code": "101025397",
        "desc": "MANO DE OBRA EN SERVICIOS TECNICOS",
        "frequency": 6
      },
      {
        "code": "133396889",
        "desc": "TARIFA DE TRANSPORTE MASAYA",
        "frequency": 6
      },
      {
        "code": "130196460",
        "desc": "INSTALACION DE PUNTO ELECTRICO",
        "frequency": 5
      },
      {
        "code": "133397232",
        "desc": "TARIFA DE TRANSPORTE MANAGUA VERACRUZ",
        "frequency": 5
      },
      {
        "code": "151580971",
        "desc": "DIAGNOSTICO DE LAVADORA MAESTROS",
        "frequency": 4
      },
      {
        "code": "135496146",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO 12000 BTU / 18000 BTU",
        "frequency": 4
      },
      {
        "code": "133396871",
        "desc": "TARIFA DE TRANSPORTE LEON EL JICARAL",
        "frequency": 4
      },
      {
        "code": "151580866",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 3
      },
      {
        "code": "101025995",
        "desc": "ARMADO DE BARBACOA",
        "frequency": 3
      },
      {
        "code": "153034981",
        "desc": "TARIFA DE TRANSPORTE MANAGUA VALLE VERDE",
        "frequency": 3
      },
      {
        "code": "137301040",
        "desc": "DESINSTALACION DE AIRE 12MIL BTU",
        "frequency": 2
      },
      {
        "code": "151580604",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 2
      },
      {
        "code": "101026023",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO",
        "frequency": 2
      },
      {
        "code": "151580612",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA CONGELADOR SUPERIOR/INFERIOR MAESTROS",
        "frequency": 2
      },
      {
        "code": "132393846",
        "desc": "SERVICIO DE INSTALACION BASICO CALENTADOR DE AGUA GEYSER",
        "frequency": 1
      },
      {
        "code": "130196451",
        "desc": "DESINTALACION DE AIRE ACONDICIONADO",
        "frequency": 1
      },
      {
        "code": "135496138",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO 24000 BTU",
        "frequency": 1
      },
      {
        "code": "133397224",
        "desc": "TARIFA DE TRANSPORTE MANAGUA TICUANTEPE",
        "frequency": 1
      },
      {
        "code": "151580428",
        "desc": "MANTENIMIENTO GENERAL DE LAVADORA MAESTROS",
        "frequency": 1
      },
      {
        "code": "133397064",
        "desc": "TARIFA DE TRANSPORTE CARAZO DIRIAMBA",
        "frequency": 1
      },
      {
        "code": "133396897",
        "desc": "TARIFA DE TRANSPORTE MASAYA NINDIRI",
        "frequency": 1
      },
      {
        "code": "133397136",
        "desc": "TARIFA DE TRANSPORTE GRANADA",
        "frequency": 1
      },
      {
        "code": "151580410",
        "desc": "MANTENIMIENTO GENERAL DE TORRE DE LAVADO MAESTROS",
        "frequency": 1
      },
      {
        "code": "151580508",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE LAVADORA MAESTROS",
        "frequency": 1
      }
    ],
    "csMatches": [
      {
        "code": "136245365",
        "desc": "SERVICIOS MISCELANEOS",
        "frequency": 22
      },
      {
        "code": "142618279",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE LEVANTAMIENTO CS",
        "frequency": 5
      },
      {
        "code": "147624686",
        "desc": "TARIFA DE TRANSPORTE POR SERVICIO CS",
        "frequency": 3
      },
      {
        "code": "134798290",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR HIDROLAVADORA ALAMBRICA CS",
        "frequency": 2
      },
      {
        "code": "148282737",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR CS",
        "frequency": 2
      },
      {
        "code": "134796374",
        "desc": "DIAGNÓSTICO TALADRO ALAMBRICO ROTOMARTILLO CAJA DE ENGRANAJE 1 CS CS",
        "frequency": 2
      },
      {
        "code": "134796462",
        "desc": "DIAGNÓSTICO BOMBA ALAMBRICAS 1 HP CS",
        "frequency": 2
      },
      {
        "code": "134797262",
        "desc": "MANTENIMIENTO CORRECTIVO DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 2
      },
      {
        "code": "134798281",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR HIDROLAVADORA ALAMBRICA CS",
        "frequency": 1
      },
      {
        "code": "135045396",
        "desc": "MANTENIMIENTO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134798169",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "134796227",
        "desc": "DIAGNÓSTICO MOTOBOMBA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "134796411",
        "desc": "DIAGNÓSTICO TALADRO INALAMBRICO ROTOMARTILLO CS",
        "frequency": 1
      },
      {
        "code": "134798741",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR COMPRESOR ALÁMBRICO 25L CS",
        "frequency": 1
      },
      {
        "code": "134798038",
        "desc": "MANTENIMIENTO CORRECTIVO TALADRO ALAMBRICO ROTOMARTILLO CAJA DE ENGRANAJE 3 CS",
        "frequency": 1
      },
      {
        "code": "134796497",
        "desc": "DIAGNÓSTICO SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "134798100",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 1/2 HP CS",
        "frequency": 1
      },
      {
        "code": "134798118",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 1 HP CS",
        "frequency": 1
      },
      {
        "code": "134798206",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134798193",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134798185",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 100L CS",
        "frequency": 1
      },
      {
        "code": "134796331",
        "desc": "DIAGNÓSTICO ESMERILADORA ALAMBRICA 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "134797596",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO DE PASO CS",
        "frequency": 1
      },
      {
        "code": "148283094",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE AIRE ACONDICIONADO 40-60K BTU CS",
        "frequency": 1
      },
      {
        "code": "134796868",
        "desc": "DIAGNÓSTICO CEPILLO ALÁMBRICA ELÉCTRICO 12 1/2\" CS",
        "frequency": 1
      },
      {
        "code": "134797983",
        "desc": "MANTENIMIENTO CORRECTIVO ESMERILADORA ALAMBRICA 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "134796340",
        "desc": "DIAGNÓSTICO ESMERILADORA ALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134799065",
        "desc": "MANTENIMIENTO TALADRO ALAMBRICO ROTOMARTILLO CAJA DE ENGRANAJE 3 CS",
        "frequency": 1
      },
      {
        "code": "134797781",
        "desc": "MANTENIMIENTO GENERAL GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 15000-17500W CS",
        "frequency": 1
      },
      {
        "code": "134797300",
        "desc": "MANTENIMIENTO CORRECTIVO GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 1100-3500-5000W CS",
        "frequency": 1
      },
      {
        "code": "135045388",
        "desc": "DIAGNÓSTICO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134798265",
        "desc": "MANTENIMIENTO CORRECTIVO ROUTERS ALAMBRICAS  CS",
        "frequency": 1
      },
      {
        "code": "134796809",
        "desc": "DIAGNÓSTICO PISTOLA DE IMPACTO INALAMBRICA CS",
        "frequency": 1
      },
      {
        "code": "134797764",
        "desc": "MANTENIMIENTO GENERAL GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE1100-3500-5000W CS",
        "frequency": 1
      },
      {
        "code": "142767362",
        "desc": "INSTALACION Y PUESTA EN MARCHA DE UPS CS",
        "frequency": 1
      },
      {
        "code": "147724978",
        "desc": "INSTALACIÓN TODO UPS CS",
        "frequency": 1
      }
    ]
  }
};
