import json, glob, os, sys
D="/private/tmp/claude-501/-Users-georgiemanavazian-Documents-Gainz/2b2b2b10-4a2f-4711-8679-98c78123d3f2/scratchpad/foods"
ORDER=["poultry","redmeat","fish-eggs","grains","dairy-etc","produce"]
out=[]; seen_names=set(); id_owner={}
for cat in ORDER:
    p=f"{D}/{cat}.json"
    if not os.path.exists(p): print("MISSING",cat); continue
    rows=json.load(open(p))
    for r in rows:
        r={k:v for k,v in r.items() if k in ("name","aliases","default","rawLabel","cooked","raw","notes")}
        r["aliases"]=sorted(set(a.lower().strip() for a in r["aliases"]))
        if not r.get("raw") or not r.get("cooked"):
            r.pop("rawLabel",None)
            if r.get("default")=="raw" and not r.get("raw"): r.pop("default")
        for h in ("cooked","raw"):
            if r.get(h):
                r[h]={k:r[h][k] for k in ("fdcId","description","kcal","protein","carbs","fat")}
        k=r["name"].lower()
        # Curation fixes on top of agent output
        if k=="chicken tenderloin, plain":   # reuses the breast ids — fold into Chicken breast as aliases
            for o in out:
                if o["name"]=="Chicken breast": o["aliases"]=sorted(set(o["aliases"])|{"chicken tenderloin","chicken tenderloins","tenderloins","grilled chicken tenders","chicken tenders plain"})
            continue
        if k=="beef steak":   # same ids as Sirloin steak — fold its aliases (steak, beef) into that row
            pending_steak=set(r["aliases"]); continue
        if k=="sirloin steak" and 'pending_steak' in dir(): r["aliases"]=sorted(set(r["aliases"])|pending_steak)
        if k=="chicken drumstick": r["aliases"]=[a for a in r["aliases"] if a!="chicken leg"]   # leg = drumstick+thigh row
        if k=="egg, whole": r["aliases"]=[a for a in r["aliases"] if "chicken" not in a]
        if k in seen_names: print("DUP NAME",r["name"]); continue
        seen_names.add(k)
        for h in ("cooked","raw"):
            if r.get(h):
                fid=r[h]["fdcId"]
                if fid in id_owner and id_owner[fid]!=r["name"]: print("DUP ID",fid,id_owner[fid],"<->",r["name"],f"[{cat}]")
                id_owner[fid]=r["name"]
        out.append(r)
print(len(out),"entries")
json.dump(out,open(os.path.expanduser("~/code/gainz-app/lib/foods.data.json"),"w"),indent=1,ensure_ascii=False)
