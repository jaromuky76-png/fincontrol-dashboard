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
  },
  "Marzo 2026": {
    "fileName": "Consolidado de ventas Marzo 2026.xlsx",
    "monthTag": "Marzo 2026",
    "processedAt": "2026-07-27 19:39:09",
    "totalSalesRows": 367739,
    "totalLaborRows": 450,
    "maestrosMatches": [
      {
        "code": "101026007",
        "desc": "INSTALACION AIRE ACONDICIONADO",
        "frequency": 161
      },
      {
        "code": "101025389",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE DIAGNOSTICO",
        "frequency": 133
      },
      {
        "code": "145518214",
        "desc": "VISITA WHATSAPP PARA FUTURA INSTALACION DE AIRE ACONDICIONADO",
        "frequency": 8
      },
      {
        "code": "101025995",
        "desc": "ARMADO DE BARBACOA",
        "frequency": 8
      },
      {
        "code": "101026031",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO",
        "frequency": 8
      },
      {
        "code": "130196460",
        "desc": "INSTALACION DE PUNTO ELECTRICO",
        "frequency": 8
      },
      {
        "code": "151529825",
        "desc": "SERVICIO DE INSTALACIÓN DE AIRE ACONDICIONADO HISENSE CON KIT BÁSICO INCLUIDO",
        "frequency": 4
      },
      {
        "code": "151580971",
        "desc": "DIAGNOSTICO DE LAVADORA MAESTROS",
        "frequency": 3
      },
      {
        "code": "130196451",
        "desc": "DESINTALACION DE AIRE ACONDICIONADO",
        "frequency": 3
      },
      {
        "code": "133397232",
        "desc": "TARIFA DE TRANSPORTE MANAGUA VERACRUZ",
        "frequency": 3
      },
      {
        "code": "151580508",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE LAVADORA MAESTROS",
        "frequency": 3
      },
      {
        "code": "133397224",
        "desc": "TARIFA DE TRANSPORTE MANAGUA TICUANTEPE",
        "frequency": 3
      },
      {
        "code": "133396889",
        "desc": "TARIFA DE TRANSPORTE MASAYA",
        "frequency": 3
      },
      {
        "code": "156587645",
        "desc": "INSTALACION DE CALENTADOR DE AGUA ELECTRICO TITAN",
        "frequency": 2
      },
      {
        "code": "133396459",
        "desc": "TARIFA DE TRANSPORTE MATAGALPA SEBACO",
        "frequency": 2
      },
      {
        "code": "133397144",
        "desc": "TARIFA DE TRANSPORTE GRANADA DIRIA",
        "frequency": 2
      },
      {
        "code": "133397136",
        "desc": "TARIFA DE TRANSPORTE GRANADA",
        "frequency": 2
      },
      {
        "code": "151580621",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE LAVADORA MAESTROS",
        "frequency": 2
      },
      {
        "code": "101025397",
        "desc": "MANO DE OBRA EN SERVICIOS TECNICOS",
        "frequency": 2
      },
      {
        "code": "133396475",
        "desc": "TARIFA DE TRANSPORTE MATAGALPA CIUDAD DARIO",
        "frequency": 1
      },
      {
        "code": "151580516",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE LAVA VAJILLAS CONTROL FRONTAL MAESTROS",
        "frequency": 1
      },
      {
        "code": "133396192",
        "desc": "TARIFA DE TRANSPORTE CHONTALES JUIGALPA",
        "frequency": 1
      },
      {
        "code": "101024888",
        "desc": "INSTALACION DE DUCHA ELECTRICA",
        "frequency": 1
      },
      {
        "code": "132393862",
        "desc": "SERVICIO DE INSTALACION HIDRONEUMATICO",
        "frequency": 1
      },
      {
        "code": "101025741",
        "desc": "MANT. O REPARAC. DE SISTEMA HIDRONEUMATICO",
        "frequency": 1
      },
      {
        "code": "137301040",
        "desc": "DESINSTALACION DE AIRE 12MIL BTU",
        "frequency": 1
      },
      {
        "code": "151580444",
        "desc": "MANTENIMIENTO GENERAL DE COCINA 5 A 6 QUEMADORES MAESTROS",
        "frequency": 1
      },
      {
        "code": "133396791",
        "desc": "TARIFA DE TRANSPORTE LEON",
        "frequency": 1
      },
      {
        "code": "133396897",
        "desc": "TARIFA DE TRANSPORTE MASAYA NINDIRI",
        "frequency": 1
      },
      {
        "code": "151580604",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "152081170",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO 12-24 MIL BTU",
        "frequency": 1
      },
      {
        "code": "151580874",
        "desc": "DIAGNOSTICO DE REFRIGERADORA CONGELADOR SUPERIOR/INFERIOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "133397064",
        "desc": "TARIFA DE TRANSPORTE CARAZO DIRIAMBA",
        "frequency": 1
      },
      {
        "code": "101026023",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO",
        "frequency": 1
      },
      {
        "code": "133397241",
        "desc": "TARIFA DE TRANSPORTE MANAGUA CIUDAD SANDINO",
        "frequency": 1
      },
      {
        "code": "152081161",
        "desc": "MANTENIMIENTO PREVENTIVO DE AIRE ACONDICIONADO 12-24 MIL BTU",
        "frequency": 1
      },
      {
        "code": "133397056",
        "desc": "TARIFA DE TRANSPORTE CARAZO JINOTEPE",
        "frequency": 1
      }
    ],
    "csMatches": [
      {
        "code": "136245365",
        "desc": "SERVICIOS MISCELANEOS",
        "frequency": 16
      },
      {
        "code": "134797650",
        "desc": "MANTENIMIENTO PREVENTIVO DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 8
      },
      {
        "code": "142618279",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE LEVANTAMIENTO CS",
        "frequency": 5
      },
      {
        "code": "143768439",
        "desc": "SERVICIO DE REPARACION DE HERRAMIENTA ELECTRICA CS",
        "frequency": 4
      },
      {
        "code": "135045329",
        "desc": "DIAGNÓSTICO TALADRO INALAMBRICO PERCUTOR CS",
        "frequency": 3
      },
      {
        "code": "134796489",
        "desc": "DIAGNÓSTICO SISTEMA HIDRONEUMÁTICO ALAMBRICAS 24L CS",
        "frequency": 2
      },
      {
        "code": "134798100",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 1/2 HP CS",
        "frequency": 2
      },
      {
        "code": "134798193",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 2
      },
      {
        "code": "134798767",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR COMPRESOR ALÁMBRICO 50L CS",
        "frequency": 2
      },
      {
        "code": "134798142",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 24L CS",
        "frequency": 2
      },
      {
        "code": "147724978",
        "desc": "INSTALACIÓN TODO UPS CS",
        "frequency": 1
      },
      {
        "code": "148282761",
        "desc": "DIAGNOSTICO DE TORRE DE LAVADO CS",
        "frequency": 1
      },
      {
        "code": "148282737",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR CS",
        "frequency": 1
      },
      {
        "code": "134798062",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR TALADRO INALAMBRICO ROTOMARTILLO CS",
        "frequency": 1
      },
      {
        "code": "134796518",
        "desc": "DIAGNÓSTICO CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134797271",
        "desc": "MANTENIMIENTO CORRECTIVO SOPLADORA MOTOR 2 TIEMPOS  CS",
        "frequency": 1
      },
      {
        "code": "134798206",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134798038",
        "desc": "MANTENIMIENTO CORRECTIVO TALADRO ALAMBRICO ROTOMARTILLO CAJA DE ENGRANAJE 3 CS",
        "frequency": 1
      },
      {
        "code": "134797941",
        "desc": "MANTENIMIENTO CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134796307",
        "desc": "DIAGNÓSTICO CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134797625",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO ACUMULACIÓN CS",
        "frequency": 1
      },
      {
        "code": "134797422",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR BRINQUINA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "134799006",
        "desc": "MANTENIMIENTO ESMERILADORA ALAMBRICA 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "134797983",
        "desc": "MANTENIMIENTO CORRECTIVO ESMERILADORA ALAMBRICA 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "135045409",
        "desc": "MANTENIMIENTO CORRECTIVO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "135045396",
        "desc": "MANTENIMIENTO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134798126",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 2 HP CS",
        "frequency": 1
      },
      {
        "code": "134797449",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR MOTOBOMBA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "134799938",
        "desc": "MANTENIMIENTO REFRIGERADOR INVERTER CS",
        "frequency": 1
      },
      {
        "code": "134798986",
        "desc": "MANTENIMIENTO CORRECTIVO PISTOLA PARA PINTAR CS",
        "frequency": 1
      },
      {
        "code": "134796500",
        "desc": "DIAGNÓSTICO SISTEMA HIDRONEUMÁTICO ALAMBRICAS 100L CS",
        "frequency": 1
      },
      {
        "code": "134796788",
        "desc": "DIAGNÓSTICO ATORNILLADOR INALÁMBRICO CS",
        "frequency": 1
      },
      {
        "code": "148282796",
        "desc": "DIAGNOSTICO DE TV 40-55 CS",
        "frequency": 1
      },
      {
        "code": "134796884",
        "desc": "DIAGNÓSTICO COMPRESOR ALÁMBRICO 25L CS",
        "frequency": 1
      },
      {
        "code": "134796147",
        "desc": "DIAGNÓSTICO GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 15000-17500W CS",
        "frequency": 1
      },
      {
        "code": "134798468",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR ABANICO ALÁMBRICO DE TECHO DECORATIVO CS",
        "frequency": 1
      }
    ]
  },
  "Abril 2026": {
    "fileName": "Consolidado de ventas Abril 2026.xlsx",
    "monthTag": "Abril 2026",
    "processedAt": "2026-07-27 19:39:49",
    "totalSalesRows": 334235,
    "totalLaborRows": 269,
    "maestrosMatches": [
      {
        "code": "101025389",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE DIAGNOSTICO",
        "frequency": 77
      },
      {
        "code": "101026007",
        "desc": "INSTALACION AIRE ACONDICIONADO",
        "frequency": 66
      },
      {
        "code": "130196460",
        "desc": "INSTALACION DE PUNTO ELECTRICO",
        "frequency": 6
      },
      {
        "code": "101026031",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO",
        "frequency": 6
      },
      {
        "code": "145518214",
        "desc": "VISITA WHATSAPP PARA FUTURA INSTALACION DE AIRE ACONDICIONADO",
        "frequency": 6
      },
      {
        "code": "133397224",
        "desc": "TARIFA DE TRANSPORTE MANAGUA TICUANTEPE",
        "frequency": 6
      },
      {
        "code": "101025995",
        "desc": "ARMADO DE BARBACOA",
        "frequency": 4
      },
      {
        "code": "133397241",
        "desc": "TARIFA DE TRANSPORTE MANAGUA CIUDAD SANDINO",
        "frequency": 3
      },
      {
        "code": "130196451",
        "desc": "DESINTALACION DE AIRE ACONDICIONADO",
        "frequency": 3
      },
      {
        "code": "133397232",
        "desc": "TARIFA DE TRANSPORTE MANAGUA VERACRUZ",
        "frequency": 3
      },
      {
        "code": "151580866",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 3
      },
      {
        "code": "101026023",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO",
        "frequency": 3
      },
      {
        "code": "133396889",
        "desc": "TARIFA DE TRANSPORTE MASAYA",
        "frequency": 3
      },
      {
        "code": "151580971",
        "desc": "DIAGNOSTICO DE LAVADORA MAESTROS",
        "frequency": 2
      },
      {
        "code": "133397081",
        "desc": "TARIFA DE TRANSPORTE CARAZO SAN MARCOS",
        "frequency": 2
      },
      {
        "code": "133397056",
        "desc": "TARIFA DE TRANSPORTE CARAZO JINOTEPE",
        "frequency": 2
      },
      {
        "code": "135496146",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO 12000 BTU / 18000 BTU",
        "frequency": 2
      },
      {
        "code": "132393846",
        "desc": "SERVICIO DE INSTALACION BASICO CALENTADOR DE AGUA GEYSER",
        "frequency": 1
      },
      {
        "code": "133397136",
        "desc": "TARIFA DE TRANSPORTE GRANADA",
        "frequency": 1
      },
      {
        "code": "151580399",
        "desc": "MANTENIMIENTO PREVENTIVO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "151529825",
        "desc": "SERVICIO DE INSTALACIÓN DE AIRE ACONDICIONADO HISENSE CON KIT BÁSICO INCLUIDO",
        "frequency": 1
      },
      {
        "code": "133397110",
        "desc": "TARIFA DE TRANSPORTE CARAZO SANTA TERESA",
        "frequency": 1
      },
      {
        "code": "133397099",
        "desc": "TARIFA DE TRANSPORTE CARAZO EL ROSARIO",
        "frequency": 1
      },
      {
        "code": "151580487",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "132393862",
        "desc": "SERVICIO DE INSTALACION HIDRONEUMATICO",
        "frequency": 1
      },
      {
        "code": "101025303",
        "desc": "INSTALACION DE ABANICO DECORATIVO",
        "frequency": 1
      },
      {
        "code": "101025741",
        "desc": "MANT. O REPARAC. DE SISTEMA HIDRONEUMATICO",
        "frequency": 1
      },
      {
        "code": "151580604",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "101026015",
        "desc": "INSTALACION TANQUE DE AGUA",
        "frequency": 1
      },
      {
        "code": "101025039",
        "desc": "INSTALACION SISTEMA HIDRONEUMATICO. CARGO BASICO",
        "frequency": 1
      },
      {
        "code": "137301040",
        "desc": "DESINSTALACION DE AIRE 12MIL BTU",
        "frequency": 1
      }
    ],
    "csMatches": [
      {
        "code": "136245365",
        "desc": "SERVICIOS MISCELANEOS",
        "frequency": 10
      },
      {
        "code": "148282737",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR CS",
        "frequency": 5
      },
      {
        "code": "134797730",
        "desc": "MANTENIMIENTO GENERAL DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 3
      },
      {
        "code": "147624686",
        "desc": "TARIFA DE TRANSPORTE POR SERVICIO CS",
        "frequency": 2
      },
      {
        "code": "134796315",
        "desc": "DIAGNÓSTICO CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO ACUMULACIÓN CS",
        "frequency": 2
      },
      {
        "code": "134798126",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 2 HP CS",
        "frequency": 2
      },
      {
        "code": "134798054",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR TALADRO INALAMBRICO ROTOMARTILLO CS",
        "frequency": 2
      },
      {
        "code": "147725014",
        "desc": "TRIFÁSICO INSTALACIÓN COMPLETA UPS CS",
        "frequency": 1
      },
      {
        "code": "134796147",
        "desc": "DIAGNÓSTICO GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 15000-17500W CS",
        "frequency": 1
      },
      {
        "code": "134797297",
        "desc": "CORRECTIVO MAYOR GENERADOR ELÉCTRICO MOTOR 2 TIEMPOS COMBUSTIBLE 800W CS",
        "frequency": 1
      },
      {
        "code": "134796518",
        "desc": "DIAGNÓSTICO CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134797220",
        "desc": "DIAGNÓSTICO CORTA GRAMA MECÁNICO CS",
        "frequency": 1
      },
      {
        "code": "134798193",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "147725006",
        "desc": "DIAGNOSTICO UPS CS",
        "frequency": 1
      },
      {
        "code": "134798185",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 100L CS",
        "frequency": 1
      },
      {
        "code": "134798169",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "134796198",
        "desc": "DIAGNÓSTICO BRINQUINA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "134797001",
        "desc": "DIAGNÓSTICO SIERRA ALÁMBRICA CIRCULAR CS",
        "frequency": 1
      },
      {
        "code": "134796622",
        "desc": "DIAGNÓSTICO MOTO SIERRA ALAMBRICAS CS",
        "frequency": 1
      },
      {
        "code": "134797941",
        "desc": "MANTENIMIENTO CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134798687",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR CEPILLO ALÁMBRICA PORTATIL 12 1/2\" CS",
        "frequency": 1
      },
      {
        "code": "134798281",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR HIDROLAVADORA ALAMBRICA CS",
        "frequency": 1
      },
      {
        "code": "134798863",
        "desc": "MANTENIMIENTO CORRECTIVO ASPIRADORA ALÁMBRICA 16GL CS",
        "frequency": 1
      },
      {
        "code": "134796358",
        "desc": "DIAGNÓSTICO ESMERILADORA INALAMBRICAS 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "135045329",
        "desc": "DIAGNÓSTICO TALADRO INALAMBRICO PERCUTOR CS",
        "frequency": 1
      },
      {
        "code": "134796331",
        "desc": "DIAGNÓSTICO ESMERILADORA ALAMBRICA 4.5\" CS",
        "frequency": 1
      },
      {
        "code": "134798960",
        "desc": "MANTENIMIENTO CORRECTIVO DUCHA ALÁMBRICA 120V/240V LORENZETI CS",
        "frequency": 1
      },
      {
        "code": "134796091",
        "desc": "DIAGNÓSTICO DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 1
      },
      {
        "code": "134798871",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR SIERRA ALÁMBRICA INGLETEADORA CS",
        "frequency": 1
      },
      {
        "code": "135045396",
        "desc": "MANTENIMIENTO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134797414",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR BRINQUINA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "148283035",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR CS",
        "frequency": 1
      },
      {
        "code": "137702724",
        "desc": "APLICACIÓN DESENGRASANTE PURPLE BLASTER 1/2 LITRO 1/7 GAL CS",
        "frequency": 1
      },
      {
        "code": "134798353",
        "desc": "MANTENIMIENTO CORRECTIVO MOTO SIERRA ALAMBRICAS  CS",
        "frequency": 1
      },
      {
        "code": "134798118",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 1 HP CS",
        "frequency": 1
      },
      {
        "code": "134798548",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DEMOLEDOR ALÁMBRICO CS",
        "frequency": 1
      },
      {
        "code": "147724994",
        "desc": "MANTENIMIENTO CORRECTIVO UPS CS",
        "frequency": 1
      },
      {
        "code": "134796155",
        "desc": "DIAGNÓSTICO GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 15000-17500W CS",
        "frequency": 1
      },
      {
        "code": "134798329",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SOLDADOR ALMÁBRICO TRANSFORMADOR CS",
        "frequency": 1
      }
    ]
  },
  "Mayo": {
    "fileName": "Consolidado de ventas Mayo.xlsx",
    "monthTag": "Mayo",
    "processedAt": "2026-07-27 19:48:43",
    "totalSalesRows": 357411,
    "totalLaborRows": 481,
    "maestrosMatches": [
      {
        "code": "101026007",
        "desc": "INSTALACION AIRE ACONDICIONADO",
        "frequency": 170
      },
      {
        "code": "101025389",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE DIAGNOSTICO",
        "frequency": 151
      },
      {
        "code": "130196460",
        "desc": "INSTALACION DE PUNTO ELECTRICO",
        "frequency": 15
      },
      {
        "code": "145518214",
        "desc": "VISITA WHATSAPP PARA FUTURA INSTALACION DE AIRE ACONDICIONADO",
        "frequency": 10
      },
      {
        "code": "133397232",
        "desc": "TARIFA DE TRANSPORTE MANAGUA VERACRUZ",
        "frequency": 9
      },
      {
        "code": "133397224",
        "desc": "TARIFA DE TRANSPORTE MANAGUA TICUANTEPE",
        "frequency": 8
      },
      {
        "code": "101025995",
        "desc": "ARMADO DE BARBACOA",
        "frequency": 7
      },
      {
        "code": "137301040",
        "desc": "DESINSTALACION DE AIRE 12MIL BTU",
        "frequency": 6
      },
      {
        "code": "101026031",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO",
        "frequency": 6
      },
      {
        "code": "151529825",
        "desc": "SERVICIO DE INSTALACIÓN DE AIRE ACONDICIONADO HISENSE CON KIT BÁSICO INCLUIDO",
        "frequency": 4
      },
      {
        "code": "101025397",
        "desc": "MANO DE OBRA EN SERVICIOS TECNICOS",
        "frequency": 3
      },
      {
        "code": "101025303",
        "desc": "INSTALACION DE ABANICO DECORATIVO",
        "frequency": 3
      },
      {
        "code": "130196451",
        "desc": "DESINTALACION DE AIRE ACONDICIONADO",
        "frequency": 3
      },
      {
        "code": "130196443",
        "desc": "INSTALACION BOMBA DE CONDENSADO",
        "frequency": 3
      },
      {
        "code": "133397241",
        "desc": "TARIFA DE TRANSPORTE MANAGUA CIUDAD SANDINO",
        "frequency": 2
      },
      {
        "code": "133397064",
        "desc": "TARIFA DE TRANSPORTE CARAZO DIRIAMBA",
        "frequency": 2
      },
      {
        "code": "151580971",
        "desc": "DIAGNOSTICO DE LAVADORA MAESTROS",
        "frequency": 2
      },
      {
        "code": "135496146",
        "desc": "MANTENIMIENTO PREVENTIVO AIRE ACONDICIONADO 12000 BTU / 18000 BTU",
        "frequency": 2
      },
      {
        "code": "151580428",
        "desc": "MANTENIMIENTO GENERAL DE LAVADORA MAESTROS",
        "frequency": 2
      },
      {
        "code": "133396889",
        "desc": "TARIFA DE TRANSPORTE MASAYA",
        "frequency": 2
      },
      {
        "code": "133396491",
        "desc": "TARIFA DE TRANSPORTE MATAGALPA ESQUPULAS",
        "frequency": 1
      },
      {
        "code": "152081170",
        "desc": "MANTENIMIENTO GENERAL DE AIRE ACONDICIONADO 12-24 MIL BTU",
        "frequency": 1
      },
      {
        "code": "132393862",
        "desc": "SERVICIO DE INSTALACION HIDRONEUMATICO",
        "frequency": 1
      },
      {
        "code": "153034797",
        "desc": "TARIFA DE TRANSPORTE MANAGUA CIUDAD EL DORAL",
        "frequency": 1
      },
      {
        "code": "151580874",
        "desc": "DIAGNOSTICO DE REFRIGERADORA CONGELADOR SUPERIOR/INFERIOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "151580938",
        "desc": "DIAGNOSTICO DE COCINA 5 A 6 QUEMADORES MAESTROS",
        "frequency": 1
      },
      {
        "code": "133397013",
        "desc": "TARIFA DE TRANSPORTE RIVAS TOLA",
        "frequency": 1
      },
      {
        "code": "133396897",
        "desc": "TARIFA DE TRANSPORTE MASAYA NINDIRI",
        "frequency": 1
      },
      {
        "code": "133397187",
        "desc": "TARIFA DE TRANSPORTE MANAGUA TIPITAPA",
        "frequency": 1
      },
      {
        "code": "133396926",
        "desc": "TARIFA DE TRANSPORTE MASAYA MASATEPE",
        "frequency": 1
      },
      {
        "code": "151580410",
        "desc": "MANTENIMIENTO GENERAL DE TORRE DE LAVADO MAESTROS",
        "frequency": 1
      },
      {
        "code": "151580866",
        "desc": "DIAGNOSTICO DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR MAESTROS",
        "frequency": 1
      },
      {
        "code": "153034869",
        "desc": "TARIFA DE TRANSPORTE MANAGUA MONTE FRESCO 2 CARRETERA SUR",
        "frequency": 1
      }
    ],
    "csMatches": [
      {
        "code": "136245365",
        "desc": "SERVICIOS MISCELANEOS",
        "frequency": 19
      },
      {
        "code": "142618279",
        "desc": "VISITA A DOMICILIO EN CONCEPTO DE LEVANTAMIENTO CS",
        "frequency": 5
      },
      {
        "code": "134798054",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR TALADRO INALAMBRICO ROTOMARTILLO CS",
        "frequency": 3
      },
      {
        "code": "147624686",
        "desc": "TARIFA DE TRANSPORTE POR SERVICIO CS",
        "frequency": 2
      },
      {
        "code": "135045396",
        "desc": "MANTENIMIENTO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 2
      },
      {
        "code": "134797300",
        "desc": "MANTENIMIENTO CORRECTIVO GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 1100-3500-5000W CS",
        "frequency": 2
      },
      {
        "code": "143768439",
        "desc": "SERVICIO DE REPARACION DE HERRAMIENTA ELECTRICA CS",
        "frequency": 1
      },
      {
        "code": "148282809",
        "desc": "DIAGNOSTICO DE TV 65-75 CS",
        "frequency": 1
      },
      {
        "code": "135045484",
        "desc": "MANTENIMIENTO CORRECTIVO SOPLADORA ALAMBRICAS  CS",
        "frequency": 1
      },
      {
        "code": "135045388",
        "desc": "DIAGNÓSTICO ESMERILADORA INALAMBRICA 7-9\" CS",
        "frequency": 1
      },
      {
        "code": "134796753",
        "desc": "DIAGNÓSTICO CARGADORES DE BATERÍA CS",
        "frequency": 1
      },
      {
        "code": "134797326",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR GENERADOR ELÉCTRICO MOTOR 4 TIEMPOS COMBUSTIBLE 15000-17500W CS",
        "frequency": 1
      },
      {
        "code": "134796518",
        "desc": "DIAGNÓSTICO CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134796307",
        "desc": "DIAGNÓSTICO CALENTADOR COMBUSTIÓN EXTERNA GAS LICUADO DE PASO CS",
        "frequency": 1
      },
      {
        "code": "137702724",
        "desc": "APLICACIÓN DESENGRASANTE PURPLE BLASTER 1/2 LITRO 1/7 GAL CS",
        "frequency": 1
      },
      {
        "code": "148283035",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR DE REFRIGERADORA SIDE BY SIDE/FRENCH DOOR CS",
        "frequency": 1
      },
      {
        "code": "134797262",
        "desc": "MANTENIMIENTO CORRECTIVO DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 1
      },
      {
        "code": "134798151",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "148283078",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR DE AIRE ACONDICIONADO 12-24K BTU CS",
        "frequency": 1
      },
      {
        "code": "134798169",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "134798290",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR HIDROLAVADORA ALAMBRICA CS",
        "frequency": 1
      },
      {
        "code": "134798206",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR CALENTADORES ALAMBRICAS DE PASO CS",
        "frequency": 1
      },
      {
        "code": "134796091",
        "desc": "DIAGNÓSTICO DESBROZADORA MOTOR 2 TIEMPOS 26-43-63 CS",
        "frequency": 1
      },
      {
        "code": "134799161",
        "desc": "MANTENIMIENTO SISTEMA HIDRONEUMÁTICO ALAMBRICAS 50L CS",
        "frequency": 1
      },
      {
        "code": "134796809",
        "desc": "DIAGNÓSTICO PISTOLA DE IMPACTO INALAMBRICA CS",
        "frequency": 1
      },
      {
        "code": "134798417",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR MICROONDAS ALÁMBRICA INTEGRADO CS",
        "frequency": 1
      },
      {
        "code": "134798118",
        "desc": "MANTENIMIENTO CORRECTIVO BOMBA ALAMBRICAS 1 HP CS",
        "frequency": 1
      },
      {
        "code": "134796198",
        "desc": "DIAGNÓSTICO BRINQUINA MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      },
      {
        "code": "134798142",
        "desc": "MANTENIMIENTO CORRECTIVO MAYOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 24L CS",
        "frequency": 1
      },
      {
        "code": "134798177",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR SISTEMA HIDRONEUMÁTICO ALAMBRICAS 100L CS",
        "frequency": 1
      },
      {
        "code": "134797369",
        "desc": "MANTENIMIENTO CORRECTIVO MENOR CORTA GRAMA TRACTOR MOTOR 4 TIEMPOS COMBUSTIBLE CS",
        "frequency": 1
      }
    ]
  }
};
