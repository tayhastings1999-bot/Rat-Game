import json,sys,glob,statistics as S
for f in sorted(glob.glob(sys.argv[1])):
    rows=[]
    for l in open(f):
        try: d=json.loads(l)
        except: continue
        if 'name' in d: rows.append(d)
    if not rows: print(f,'(none yet)'); continue
    t=[r['time'] for r in rows]; cl=[r for r in rows if r['status']=='trans']
    print(f"{rows[0]['name']}: n={len(rows)} median={S.median(t)/60:.1f}m cleared={len(cl)} times={[round(x/60,1) for x in t]}")
    for r in rows: print('   ',r['status'],round(r['time']/60,1),'nests',r['nestsLeft'],'boss',r['boss'],'by',r['by'][:60])
