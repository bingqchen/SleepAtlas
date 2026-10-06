"""Deterministic, transparent estimates. Not a full Pokémon Sleep simulator."""
from pathlib import Path
import copy
import hashlib
import json
import math
import random
import re
from functools import lru_cache

CATALOG = json.loads((Path(__file__).parent / 'catalog/pokemon.json').read_text())
SPECIES = {p['name']: p for p in CATALOG['species']}
NATURES = {n['name']: n for n in CATALOG['natures']}
SUBSKILLS = {s['name']: s for s in CATALOG['subskills']}
UNLOCKS = (10, 25, 50, 70, 80)
MODEL_VERSION = 'atlas-1.1'
SAMPLE_COUNT = 1000
DEFAULT_SETTINGS = {'energyMultiplier': 2.2, 'sleepHours': 8.5, 'collectionHours': 3, 'areaBonus': 0, 'favoriteBerry': False, 'teamHelpingBonus': 0}

def number(value, name, low, high, integer=False):
    if isinstance(value, bool):
        raise ValueError(f'{name} must be a number.')
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} must be a number.')
    if not math.isfinite(n) or not low <= n <= high or (integer and n != int(n)):
        raise ValueError(f'{name} must be {"a whole number " if integer else ""}between {low} and {high}.')
    return int(n) if integer else n

def validate_build(raw):
    if not isinstance(raw, dict):
        raise ValueError('Expected Pokémon details.')
    species = raw.get('species')
    if species not in SPECIES:
        raise ValueError('Choose a supported species.')
    p = SPECIES[species]
    nature = raw.get('nature')
    if nature not in NATURES:
        raise ValueError('Choose a nature.')
    level = number(raw.get('level'), 'Level', 1, 100, True)
    skill_max = len(p['skill'].get('RP', [1]*7))
    skill_level = number(raw.get('skillLevel'), 'Main skill level', 1, skill_max, True)
    subskills = raw.get('subskills', [])
    if not isinstance(subskills, list) or len(subskills) != 5 or any(s and s not in SUBSKILLS for s in subskills):
        raise ValueError('Choose five valid subskill slots (or leave a slot unknown).')
    chosen = [s for s in subskills if s]
    if len(set(chosen)) != len(chosen):
        raise ValueError('Each subskill can appear only once.')
    ingredients = raw.get('ingredients', [])
    if not isinstance(ingredients, list) or len(ingredients) != 3:
        raise ValueError('Choose an ingredient for each unlock level.')
    for idx, key in enumerate(('ingredient0','ingredient30','ingredient60')):
        if ingredients[idx] not in [x['ingredient']['name'] for x in p[key]]:
            raise ValueError(f'Invalid ingredient for the level {(1,30,60)[idx]} slot.')
    settings = dict(DEFAULT_SETTINGS)
    incoming = raw.get('settings', {})
    if not isinstance(incoming, dict):
        raise ValueError('Invalid analysis settings.')
    for key, low, high in [('energyMultiplier',1,2.5),('sleepHours',0,12),('collectionHours',0.25,12),('areaBonus',0,100),('teamHelpingBonus',0,4)]:
        settings[key] = number(incoming.get(key,settings[key]),key,low,high,key=='teamHelpingBonus')
    if not isinstance(incoming.get('favoriteBerry',False), bool):
        raise ValueError('Favorite berry must be true or false.')
    settings['favoriteBerry'] = incoming.get('favoriteBerry',False)
    nickname = raw.get('nickname') or p['displayName']
    if not isinstance(nickname,str) or len(nickname) > 80:
        raise ValueError('Name must contain at most 80 characters.')
    notes = raw.get('notes','')
    if not isinstance(notes,str) or len(notes)>4000:
        raise ValueError('Notes must contain at most 4,000 characters.')
    return {'species':species,'nickname':nickname.strip() or p['displayName'],'nature':nature,'level':level,'skillLevel':skill_level,'subskills':subskills,'ingredients':ingredients,'settings':settings,'notes':notes,'carrySize':number(raw.get('carrySize',p['carrySize']),'Carry limit',1,200,True)}

def _skill_expectation(helps, chance, cap):
    # Expected min(Binomial(n,p), capacity), interpolated between integer n.
    def at(n):
        if n <= 0: return 0.0
        none = (1-chance)**n
        if cap == 1: return 1-none
        one = n*chance*(1-chance)**(n-1)
        return 2-2*none-one
    n = math.floor(helps)
    return at(n)+(helps-n)*(at(n+1)-at(n))

def calculate(build, level=None):
    p = SPECIES[build['species']]
    level = level or build['level']
    nature = NATURES[build['nature']]
    active = {s for s,unlock in zip(build['subskills'],UNLOCKS) if s and level>=unlock}
    settings=build['settings']
    bonus=lambda name: SUBSKILLS[name]['amount'] if name in active else 0
    speed=min(.35,bonus('Helping Speed S')+bonus('Helping Speed M')+bonus('Helping Bonus')+.05*settings['teamHelpingBonus'])
    frequency=math.floor(round((1-.002*(level-1))*(2-nature['frequency'])*(1-speed),4)*p['frequency'])
    helps_per_hour=3600/frequency*settings['energyMultiplier']
    ing_rate=min(1,p['ingredientPercentage']/100*nature['ingredient']*(1+bonus('Ingredient Finder S')+bonus('Ingredient Finder M')))
    skill_rate=min(.999999,p['skillPercentage']/100*nature['skill']*(1+bonus('Skill Trigger S')+bonus('Skill Trigger M')))
    berry_amount=(2 if p['specialty'] in ('berry','all') else 1)+bonus('Berry Finding S')
    slots=[]
    possible={}
    for idx,key in enumerate(('ingredient0','ingredient30','ingredient60')):
        for option in p[key]:possible[option['ingredient']['name']]=option['ingredient']
        if level>=(1,30,60)[idx]:slots.append(next(x for x in p[key] if x['ingredient']['name']==build['ingredients'][idx]))
    mean_amount=sum(x['amount'] for x in slots)/len(slots)
    items_per_help=ing_rate*mean_amount+(1-ing_rate)*berry_amount
    # carrySize is the displayed effective capacity at the current level.
    # For comparison builds, caller adjusts it for sampled inventory subskills.
    carry=build['carrySize']
    if level != build['level']:
        now={s for s,u in zip(build['subskills'],UNLOCKS) if s and build['level']>=u}
        carry+=sum(SUBSKILLS[s]['amount'] for s in active-now if s.startswith('Inventory Up'))
        carry-=sum(SUBSKILLS[s]['amount'] for s in now-active if s.startswith('Inventory Up'))
        carry=max(1,carry)
    hours=24-settings['sleepHours'];intervals=[]
    while hours>1e-8:
        duration=min(settings['collectionHours'],hours);intervals.append(duration);hours-=duration
    if settings['sleepHours']>0:intervals.append(settings['sleepHours'])
    normal_helps=overflow=triggers=0
    for duration in intervals:
        helps=duration*helps_per_hour
        effective=min(helps,carry/items_per_help)
        normal_helps+=effective;overflow+=helps-effective
        triggers+=_skill_expectation(effective,skill_rate,2 if p['specialty'] in ('skill','all') else 1)
    quantities={name:0.0 for name in possible}
    for slot in slots:quantities[slot['ingredient']['name']]+=normal_helps*ing_rate/len(slots)*slot['amount']
    berries=(normal_helps*(1-ing_rate)+overflow)*berry_amount
    base=p['berry']['value']
    berry_value=math.floor(max(base+level-1,base*1.025**(level-1))+.5)
    area=1+settings['areaBonus']/100
    berry_strength=berries*berry_value*(2 if settings['favoriteBerry'] else 1)*area
    ingredient_strength=sum(quantities[k]*v['value'] for k,v in possible.items())*area
    skill=p['skill']; skill_index=build['skillLevel']-1
    direct=skill.get('strengthAmountsMean') or skill.get('strengthAmounts')
    # Composite skill effects and team synergy are deliberately not converted.
    direct_supported=bool(direct) and not skill.get('modifierName')
    skill_strength=triggers*direct[skill_index]*area if direct_supported else 0.0
    random_ingredients=triggers*skill['ingredientAmounts'][skill_index] if skill.get('name')=='Ingredient Magnet S' and not skill.get('modifierName') else 0
    return {'level':level,'skillTriggers':triggers,'strength':berry_strength+ingredient_strength+skill_strength,'ingredientCount':sum(quantities.values()),'randomIngredients':random_ingredients,'berryCount':berries,'berryStrength':berry_strength,'ingredientStrength':ingredient_strength,'skillStrength':skill_strength,'frequencySeconds':frequency,'ingredientRate':ing_rate,'skillRate':skill_rate,'activeSubskills':sorted(active),'ingredients':[{'name':name,'longName':possible[name]['longName'],'count':qty,'strength':qty*possible[name]['value']*area} for name,qty in quantities.items()],'supportSkillExcluded':not direct_supported or p['skillLabel'] not in ('Charge Strength S','Charge Strength M'),'normalHelps':normal_helps,'sneakyHelps':overflow}

@lru_cache(maxsize=128)
def reference_builds(serialized):
    build=json.loads(serialized);rng=random.Random(617204)
    keys=['skillTriggers','strength','ingredientCount']
    reference={key:[] for key in keys};reference['ingredients']={}
    original_inventory=sum(SUBSKILLS[s]['amount'] for s,u in zip(build['subskills'],UNLOCKS) if s and u<=build['level'] and s.startswith('Inventory Up'))
    base_carry=max(1,build['carrySize']-original_inventory)
    for _ in range(SAMPLE_COUNT):
        sample=copy.deepcopy(build)
        sample['nature']=rng.choice(list(NATURES))
        sample['subskills']=rng.sample(list(SUBSKILLS),5)
        sample['carrySize']=base_carry+sum(SUBSKILLS[s]['amount'] for s,u in zip(sample['subskills'],UNLOCKS) if u<=build['level'] and s.startswith('Inventory Up'))
        result=calculate(sample)
        for key in keys:reference[key].append(result[key])
        for item in result['ingredients']:reference['ingredients'].setdefault(item['name'],[]).append(item['count'])
    return reference

def percentile(value, values):
    lower=sum(x<value-1e-7 for x in values)
    equal=sum(abs(x-value)<=1e-7 for x in values)
    return round(100*(lower+equal/2)/len(values))

def analyze(raw):
    build=validate_build(raw)
    current=calculate(build)
    reference=reference_builds(json.dumps(build,sort_keys=True))
    current['ratings']={key:percentile(current[key],reference[key]) for key in ['skillTriggers','strength','ingredientCount']}
    for item in current['ingredients']:
        item['rating']=percentile(item['count'],reference['ingredients'][item['name']]) if item['count'] else None
    forecasts=[calculate(build,level) for level in (30,60) if level>build['level']]
    p=SPECIES[build['species']]
    alternatives=[]
    for slot30 in p['ingredient30']:
        for slot60 in p['ingredient60']:
            variant=copy.deepcopy(build)
            variant['ingredients']=[build['ingredients'][0],slot30['ingredient']['name'],slot60['ingredient']['name']]
            result=calculate(variant,60)
            alternatives.append({'slots':variant['ingredients'],'ingredients':result['ingredients'],'ingredientCount':result['ingredientCount'],'strength':result['strength']})
    warnings=[]
    if any(not s and u<=build['level'] for s,u in zip(build['subskills'],UNLOCKS)):
        warnings.append('Some unlocked subskills are unknown; those slots contribute no bonus.')
    if current['supportSkillExcluded']:
        warnings.append(f'{p["skillLabel"]} triggers are estimated, but its indirect/team effects are excluded from strength.')
    if current['randomIngredients']:
        warnings.append('Ingredient Magnet bonus items are shown separately. Their types and strength depend on your unlocked ingredients.')
    if build['level']>70:
        warnings.append('Levels above 70 are hypothetical projections, not a claim about the current in-game level cap.')
    return {'build':build,'current':current,'forecasts':forecasts,'ingredientAlternatives':alternatives,'warnings':warnings,'modelVersion':MODEL_VERSION,'catalogCommit':CATALOG['commit'],'referenceCount':SAMPLE_COUNT}

def parse_ocr(images):
    lines=[line for image in images for line in image['lines']]
    text='\n'.join(line['text'] for line in lines)
    normalized=lambda s: re.sub(r'[^a-z0-9]','',s.lower())
    found={};detected=[]
    # Longest names first prevents matching evolutions/forms as a shorter name.
    for p in sorted(SPECIES.values(),key=lambda p:len(p['displayName']),reverse=True):
        if any(normalized(l['text'])==normalized(p['displayName']) for l in lines):
            found['species']=p['name'];break
    for nature in NATURES:
        if re.search(r'\b'+re.escape(nature)+r'\b',text,re.I):found['nature']=nature;break
    if found.get('species'):
        p=SPECIES[found['species']]
        skill_names=[p['skillLabel'],p['skill'].get('name','')]
        for image in images:
            anchors=[line for line in image['lines'] if any(name and normalized(name)==normalized(line['text']) for name in skill_names)]
            for anchor in anchors:
                candidates=[]
                for line in image['lines']:
                    match=re.fullmatch(r'(?:Lv\.?|Level)\s*(\d)',line['text'].strip(),re.I)
                    if match and -.025<=line['y']-anchor['y']<=.10 and int(match[1])<=len(p['skill'].get('RP',[1]*7)):
                        candidates.append((abs(line['y']-anchor['y']),int(match[1])))
                if candidates:found['skillLevel']=min(candidates)[1]
    for image in images:
        for line in image['lines']:
            if line['y']<.4:
                match=re.search(r'\b(?:Lv\.?|Level)\s*(\d{1,3})\b',line['text'],re.I)
                if match and 1<=int(match[1])<=100:
                    found.setdefault('level',int(match[1]))
    carry=re.search(r'carry\s*(?:limit|size)\s*[:\n]?\s*(\d{1,3})',text,re.I)
    if carry:found['carrySize']=int(carry[1])
    for name in SUBSKILLS:
        if any(normalized(name)==normalized(l['text']) for l in lines):detected.append(name)
    subskills=['']*5
    for image in images:
        for line in image['lines']:
            name=next((s for s in detected if normalized(s)==normalized(line['text'])),None)
            if not name:continue
            labels=[]
            for other in image['lines']:
                m=re.fullmatch(r'(?:Lv\.?\s*)?(10|25|50|70|80)',other['text'].strip(),re.I)
                if m and -0.02<=line['y']-other['y']<=.075 and abs(line['x']-other['x'])<.16:
                    labels.append((abs(line['y']-other['y']),int(m[1])))
            if labels:
                slot=UNLOCKS.index(min(labels)[1]);subskills[slot]=name
    found['subskills']=subskills
    confidence=sum(l['confidence'] for l in lines)/len(lines) if lines else 0
    return {'fields':found,'detectedSubskills':detected,'text':text,'confidence':confidence,'warnings':['Check all extracted details before saving.','Ingredient icons are not identified by text recognition. Confirm all three slots.','Confirm the displayed main skill level and carry limit.']}
