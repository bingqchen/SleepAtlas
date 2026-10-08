"""RP adapted from Neroli's Lab, copyright 2025 Neroli's Lab Authors.
Apache-2.0; see licenses/nerolis-lab-LICENSE. Modified for Sleep Atlas builds.
Pinned source: common/src/utils/rp-utils/rp.ts at 74e5068c1fa76518803caa8705798389da7f635d.
"""
import math
GROWTH=[None, 1.0, 1.003, 1.007, 1.011, 1.016, 1.021, 1.027, 1.033, 1.039, 1.046, 1.053, 1.061, 1.069, 1.077, 1.085, 1.094, 1.104, 1.114, 1.124, 1.134, 1.145, 1.156, 1.168, 1.18, 1.192, 1.205, 1.218, 1.231, 1.245, 1.259, 1.274, 1.288, 1.303, 1.319, 1.335, 1.351, 1.368, 1.385, 1.402, 1.42, 1.439, 1.457, 1.477, 1.496, 1.517, 1.537, 1.558, 1.58, 1.602, 1.625, 1.648, 1.671, 1.696, 1.72, 1.745, 1.771, 1.798, 1.824, 1.852, 1.88, 1.927, 1.975, 2.024, 2.075, 2.127, 2.18, 2.235, 2.29, 2.348, 2.406]
WEIGHTS={'Dream Shard Bonus':.221,'Energy Recovery Bonus':.221,'Helping Bonus':.221,'Research EXP Bonus':.221,'Sleep EXP Bonus':.221,'Inventory Up S':.071,'Inventory Up M':.139,'Inventory Up L':.181}
def rp_floor(value,decimals):
    factor=10**decimals; shifted=value*factor; nearest=math.floor(shifted+.5)
    return math.floor(nearest if abs(shifted-nearest)<1e-10 else shifted)/factor

def calculate_rp(catalog,build,skill,effective_level,level=None):
    level=level or build['level']
    if level>70 or (build['species']=='MEW' and not build.get('mainSkill')):return None
    p=next(p for p in catalog['species'] if p['name']==build['species'])
    nature=next(n for n in catalog['natures'] if n['name']==build['nature'])
    active={s for s,unlock in zip(build['subskills'],[10,25,50,70,80]) if s and level>=unlock}
    bonus=lambda name:next(s['amount'] for s in catalog['subskills'] if s['name']==name) if name in active else 0
    speed=max(.65,1-bonus('Helping Speed M')-bonus('Helping Speed S'))
    helps=5*rp_floor(3600/(p['frequency']*rp_floor((1-.002*(level-1))*round(2-nature['frequency'],3)*speed,4)),2)
    ingredients_chance=rp_floor(p['ingredientPercentage']/100*nature['ingredient']*round(1+bonus('Ingredient Finder M')+bonus('Ingredient Finder S'),2),4)
    chance=build.get('mewSkillChance',p['skillPercentage']) if p['name']=='MEW' else p['skillPercentage']
    skills_chance=rp_floor(chance/100*round(1+bonus('Skill Trigger M')+bonus('Skill Trigger S'),2)*nature['skill'],4)
    slots=[next(s for s in p[f'ingredient{unlock}'] if s['ingredient']['name']==build['ingredients'][i]) for i,unlock in enumerate([0,30,60]) if level>=unlock]
    value=math.floor(sum(s['amount']*s['ingredient']['value'] for s in slots)/len(slots))
    ingredients=rp_floor(helps*ingredients_chance*value*GROWTH[level],2)
    berry_count=(2 if p['specialty'] in ('berry','all') else 1)+bonus('Berry Finding S')
    berry_value=berry_count*max(p['berry']['value']+level-1,math.floor(p['berry']['value']*1.025**(level-1)+.5))
    berries=rp_floor(helps*(1-ingredients_chance)*berry_value,2)
    skill_rp=rp_floor(helps*skills_chance*skill['RP'][effective_level-1],2)
    energy=.92 if nature['energy']<1 else 1.08 if nature['energy']>1 else 1
    misc=rp_floor(energy*(1+sum(WEIGHTS.get(s,0) for s in build['subskills'] if s in active)),2)
    return math.floor(misc*(ingredients+berries+skill_rp)+.5)
