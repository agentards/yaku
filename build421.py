import pandas as pd, geopandas as gpd, unicodedata, re, json, warnings
warnings.filterwarnings('ignore')
exec(open('audit421.py').read())
O='data/cenepred_421_piura/'; import os; os.makedirs(O,exist_ok=True)
S=load('aviso_421_2026.xlsx'); ks=list(S)
mm,_=mm_df(S[ks[0]]); cp=tab(S[ks[1]]); es=tab(S[ks[2]]); ie=tab(S[ks[3]])
ie=ie[[c for c in ie.columns if not str(c).startswith('_vac')]]
pm=mm[mm.Departamento=='PIURA'].copy(); pc=cp[cp.Departamento=='PIURA'].copy(); pe=es[es.Departamento=='PIURA'].copy(); pi=ie[ie.Departamento=='PIURA'].copy()
for c in ['Población','Viviendas']: pc[c]=pc[c].astype('Int64')
pm.to_csv(O+'aviso421_piura_distritos_MM.csv',index=False); pc.to_csv(O+'aviso421_piura_centros_poblados_INUND.csv',index=False)
pe.to_csv(O+'aviso421_piura_establecimientos_salud_INUN.csv',index=False); pi.to_csv(O+'aviso421_piura_instituciones_educativas_INUN.csv',index=False)
print('export', len(pm),len(pc),len(pe),len(pi))
# --- districts
dist=gpd.read_file('data/raw/limites/geosinpad_DISTRITOS_PIURA.geojson')
print('dist ubigeo dup',dist.UBI_DIST.duplicated().sum())
m=pm.merge(dist[['UBI_DIST','NOMBDIST','geometry']],left_on='Ubigeo distrital',right_on='UBI_DIST',how='left')
print('MM→distritos match',m.geometry.notna().sum(),'/',len(m)); print('nombre distinto:',m[m.Distrito!=m.NOMBDIST][['Ubigeo distrital','Distrito','NOMBDIST']].to_string())
# --- CCPP IGN
ign=gpd.read_file('data/raw/ign/CCPP/CCPP_IGN100K.shp'); ign=ign.rename(columns={'CÓDIGO':'COD_IGN'})
ip=ign[(ign.COD_IGN.str[:2]=='20')&(ign.COD_IGN.str.len()==10)]
print('IGN Piura codes',len(ip),'dup',ip.COD_IGN.duplicated().sum(),'len',ip.COD_IGN.str.len().value_counts().to_dict(), 'FUENTE',ip.FUENTE.value_counts().to_dict())
ipu=ip.drop_duplicates('COD_IGN')
c=pc.merge(ipu[['COD_IGN','NOM_POBLAD','FUENTE','CATEGORIA','geometry']],left_on='Código del centro poblado',right_on='COD_IGN',how='left')
c=gpd.GeoDataFrame(c,geometry='geometry',crs='EPSG:4326')
ok=c.geometry.notna()
lvl='Nivel de exposición a inundaciones'
print('CP match',ok.sum(),'/',len(c),f'{ok.mean()*100:.1f}%'); print(' por nivel', c.groupby(lvl).apply(lambda d:f"{d.geometry.notna().sum()}/{len(d)}").to_dict())
print(' pob georef', c.loc[ok,'Población'].sum(),'/',c['Población'].sum())
def norm(s): s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().upper(); return re.sub(r'[^A-Z0-9]','',s)
c['nombre_coincide']=[norm(a)==norm(b) if isinstance(b,str) else None for a,b in zip(c['Nombre delcentro poblado'],c['NOM_POBLAD'])]
print(' nombre coincide en match',c.loc[ok,'nombre_coincide'].mean())
# point inside its district polygon?
dd=dist.set_index('UBI_DIST').geometry
c['dentro_distrito']=[dd[u].buffer(0.001).contains(g) if (g is not None and u in dd.index) else None for u,g in zip(c['Ubigeo de distrito'],c.geometry)]
print(' punto dentro de su distrito',c.loc[ok,'dentro_distrito'].mean())
c.drop(columns='geometry').to_csv(O+'aviso421_piura_centros_poblados_INUND_georef.csv',index=False)
# --- II.EE by codigo modular
esc=gpd.read_file('data/raw/minedu/geosinpad_IE_ESCALE_MINEDU_PIURA.geojson')
print('ESCALE Piura',len(esc),'dup COD_MOD',esc.COD_MOD.duplicated().sum(), 'dup COD_MOD+ANEXO',esc[['COD_MOD','ANEXO']].duplicated().sum())
e0=esc.sort_values('ANEXO').drop_duplicates('COD_MOD')
j=pi.merge(e0[['COD_MOD','ANEXO','CODLOCAL','CEN_EDU','NLAT_IE','NLONG_IE','FECHA_ACT']],left_on='Codigo modular',right_on='COD_MOD',how='left')
print('IE match',j.COD_MOD.notna().sum(),'/',len(j),f"{j.COD_MOD.notna().mean()*100:.1f}%",'codlocal coincide',(j['Codigo de local']==j.CODLOCAL)[j.COD_MOD.notna()].mean())
j.to_csv(O+'aviso421_piura_instituciones_educativas_INUN_georef.csv',index=False)
# --- EESS by name+ubigeo (no code in RENIPRESS layer)
ren=gpd.read_file('data/raw/minsa/geosinpad_MINSA_RENIPRESS_PIURA.geojson'); ren['k']=ren.UBIGEO_DIST.astype(str)+'|'+ren.NOM_ESTABLECIMIENTO.map(norm)
pe['k']=pe['Ubigeo distrital'].astype(str)+'|'+pe['Nombre del establecimiento de salud'].map(norm)
dupk=ren.k.duplicated(keep=False)
r1=ren[~dupk]
k=pe.merge(r1[['k','NOM_ESTABLECIMIENTO','CATEGORIA','NORTE','ESTE']],on='k',how='left')
print('EESS match nombre+ubigeo (únicos)',k.NORTE.notna().sum(),'/',len(k),f"{k.NORTE.notna().mean()*100:.1f}%", 'claves ambiguas en RENIPRESS',dupk.sum())
k.drop(columns='k').to_csv(O+'aviso421_piura_establecimientos_salud_INUN_georef_por_nombre.csv',index=False)
# --- GeoJSON
COMMON=dict(fuente='CENEPRED/SIGRID – anexo Excel del Aviso Meteorológico 421_2026',
  aviso='Aviso Meteorológico SENAMHI N° 421 (2026)', escenario_sigrid='23077 (según título del Excel y del PDF; ver RESUMEN)',
  vigencia='17-19 oct 2026', clasificacion='escenario hipotético basado en pronóstico', rotulo='Escenario de riesgo CENEPRED',
  nota='nivel de exposición/riesgo, no profundidad de agua', fecha_incorporacion='2026-10-17')
feats=[]
for _,r in m.iterrows():
    feats.append({**COMMON,'capa':'distritos_riesgo_movimientos_en_masa','hoja_origen':ks[0],'ubigeo':r['Ubigeo distrital'],'provincia':r['Provincia'],'distrito':r['Distrito'],
      'campo_original':'Nivel de Riesgo','nivel_original':r['Nivel de Riesgo'],'nivel_texto':{'MA':'Muy Alto','A':'Alto','M':'Medio','B':'Bajo'}.get(r['Nivel de Riesgo']),
      'peligro':'movimientos en masa','poblacion_excel':int(r['6/Población']),'viviendas_excel':int(r['7/Viviendas']),
      'geom_fuente':'INDECI geosinpad LimitesAdministrativos/limitesAdministrativos capa 0 (SDE.DISTRITOS), unión por UBIGEO','geometry':r.geometry})
for _,r in c[ok].iterrows():
    feats.append({**COMMON,'capa':'centros_poblados_exposicion_inundaciones','hoja_origen':ks[1],'ubigeo':r['Ubigeo de distrito'],'provincia':r['Provincia'],'distrito':r['Distrito'],
      'codigo_ccpp':r['Código del centro poblado'],'nombre_ccpp':r['Nombre delcentro poblado'],
      'campo_original':'Nivel de exposición a inundaciones','nivel_original':r[lvl],'nivel_texto':r[lvl],'peligro':'inundaciones',
      'poblacion_excel':None if pd.isna(r['Población']) else int(r['Población']),'viviendas_excel':None if pd.isna(r['Viviendas']) else int(r['Viviendas']),
      'nota_hoja':"La hoja se llama 'CentrosPobladosEnRiesgo_INUND' pero la columna es 'Nivel de exposición a inundaciones': es nivel de EXPOSICIÓN, no de riesgo.",
      'nombre_ign':r['NOM_POBLAD'],'nombre_coincide_normalizado':'si' if r['nombre_coincide'] is True else 'no','punto_dentro_de_su_distrito':'si' if r['dentro_distrito'] is True else ('no' if r['dentro_distrito'] is False else None),
      'geom_fuente':'IGN – Dataset Centros Poblados (CCPP_IGN100K, datosabiertos.gob.pe), unión por código de 10 dígitos (campo CÓDIGO); FUENTE IGN/INEI='+str(r['FUENTE']),
      'geometry':r.geometry})
g=gpd.GeoDataFrame(feats,crs='EPSG:4326')
g.to_file('data/piura_cenepred_421.geojson',driver='GeoJSON')
t=gpd.read_file('data/piura_cenepred_421.geojson'); print('GEOJSON',len(t),t.crs,t.is_valid.all(),t.geom_type.value_counts().to_dict(),t.capa.value_counts().to_dict())
