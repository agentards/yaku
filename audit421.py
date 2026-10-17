import pandas as pd, openpyxl, hashlib
P='data/raw/cenepred/usuario/'
def load(f):
    wb=openpyxl.load_workbook(P+f,read_only=True); out={}
    for ws in wb.worksheets:
        rows=list(ws.iter_rows(values_only=True)); out[ws.title]=rows
    return out
def mm_df(rows):
    hdr=['Departamento','Provincia','Ubigeo distrital','Distrito','1/ Condición del territorio','2/ N° Eventos mov. masa','Valor de Susceptib.','3/ Incidencia de Pobreza','4/ Desnutrición Crónica','5/ Tasa de Analfabetismo','Valor de Exposición','Nivel de Riesgo','6/Población','7/Viviendas','8/Establecim. de salud','9/ Instituc. educativas','10/ Alumnos','11/Docentes']
    data=[r for r in rows[3:] if r[2] is not None and str(r[2]).strip().isdigit()]
    tail=[r for r in rows[3:] if not (r[2] is not None and str(r[2]).strip().isdigit()) and any(v is not None for v in r)]
    return pd.DataFrame(data,columns=hdr), tail
def tab(rows):
    h=list(rows[0]); 
    h=[x if x is not None else f'_vacía_{i}' for i,x in enumerate(h)]
    return pd.DataFrame(rows[1:],columns=h)
