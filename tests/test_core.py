import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest
import uuid
import analysis_engine as engine
import storage


def build(species='RAICHU',level=30):
    p=engine.SPECIES[species]
    return engine.validate_build({'species':species,'level':level,'nature':'Hardy','skillLevel':1,'carrySize':p['carrySize']+5*p['previousEvolutions'],'subskills':['']*5,'ingredients':[p[k][0]['ingredient']['name'] for k in ('ingredient0','ingredient30','ingredient60')]})

class CalculationTests(unittest.TestCase):
    def test_all_catalog_species_analyze_without_missing_ingredients(self):
        self.assertEqual(len(engine.SPECIES),247)
        for name in engine.SPECIES:
            with self.subTest(species=name):
                result=engine.analyze(build(name,60));c=result['current']
                self.assertGreater(c['strength'],0)
                self.assertGreater(c['skillTriggers'],0)
                self.assertAlmostEqual(c['ingredientCount'],sum(i['count'] for i in c['ingredients']))
                self.assertAlmostEqual(c['strength'],c['berryStrength']+c['ingredientStrength']+c['skillStrength'])
                self.assertTrue(all(0<=r<=100 for r in c['ratings'].values()))
    def test_locked_subskills_do_not_apply(self):
        a=build();b=copy.deepcopy(a);b['subskills'][2]='Helping Speed M'
        self.assertEqual(engine.calculate(a),engine.calculate(b))
    def test_unlocked_speed_improves_frequency(self):
        a=build();b=copy.deepcopy(a);b['subskills'][0]='Helping Speed M'
        self.assertLess(engine.calculate(b)['frequencySeconds'],engine.calculate(a)['frequencySeconds'])
    def test_favorite_berry_only_doubles_berry_strength(self):
        a=build();b=copy.deepcopy(a);b['settings']['favoriteBerry']=True
        x,y=engine.calculate(a),engine.calculate(b)
        self.assertAlmostEqual(y['berryStrength'],x['berryStrength']*2)
        self.assertEqual(y['ingredientStrength'],x['ingredientStrength'])
    def test_area_bonus_scales_strength_not_count(self):
        a=build();b=copy.deepcopy(a);b['settings']['areaBonus']=50
        x,y=engine.calculate(a),engine.calculate(b)
        self.assertAlmostEqual(y['strength'],x['strength']*1.5)
        self.assertEqual(y['ingredientCount'],x['ingredientCount'])
    def test_ingredients_unlock_at_30_and_60(self):
        b=build('RAICHU',29);b['ingredients']=['Apple','Ginger','Egg']
        for level,expected in [(29,{'Apple'}),(30,{'Apple','Ginger'}),(60,{'Apple','Ginger','Egg'})]:
            actual={i['name'] for i in engine.calculate(b,level)['ingredients'] if i['count']>0}
            self.assertEqual(actual,expected)
    def test_no_double_applied_displayed_skill_level(self):
        a=build();b=copy.deepcopy(a);b['subskills'][0]='Skill Level Up M'
        self.assertEqual(engine.calculate(a)['skillStrength'],engine.calculate(b)['skillStrength'])
    def test_collection_and_inventory_limit_skills(self):
        b=build('VAPOREON');b['settings']['sleepHours']=0;b['settings']['collectionHours']=12
        self.assertLessEqual(engine.calculate(b)['skillTriggers'],4)
        b['settings']['collectionHours']=1
        self.assertGreater(engine.calculate(b)['skillTriggers'],1)
    def test_bank_expectation_known_values(self):
        self.assertAlmostEqual(engine._skill_expectation(2,.5,1),.75)
        self.assertAlmostEqual(engine._skill_expectation(2,.5,2),1)
        self.assertAlmostEqual(engine._skill_expectation(0,.5,2),0)
    def test_all_specialty_uses_two_berries_and_two_skill_slots(self):
        b=build('DARKRAI');b['settings']['sleepHours']=0;b['settings']['collectionHours']=12
        c=engine.calculate(b)
        self.assertAlmostEqual(c['berryCount'],2*(c['normalHelps']*(1-c['ingredientRate'])+c['sneakyHelps']))
        self.assertLessEqual(c['skillTriggers'],4)
        self.assertAlmostEqual(c['skillTriggers'],2*engine._skill_expectation(c['normalHelps']/2,c['skillRate'],2))
    def test_support_strength_is_not_fabricated(self):
        c=engine.calculate(build('WIGGLYTUFF'))
        self.assertEqual(c['skillStrength'],0);self.assertTrue(c['supportSkillExcluded'])
    def test_random_ingredients_separate(self):
        c=engine.calculate(build('VAPOREON'))
        self.assertGreater(c['randomIngredients'],0)
        self.assertAlmostEqual(c['ingredientCount'],sum(i['count'] for i in c['ingredients']))
    def test_invalid_builds_rejected(self):
        for field,value in [('level',float('nan')),('level',True),('skillLevel',99),('nature','Fake'),('ingredients',['Tail']*3),('subskills',['Berry Finding S']*5)]:
            b=build();b[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):engine.validate_build(b)
    def test_seeded_ratings_are_repeatable(self):
        b=build();a=engine.analyze(b);engine.reference_builds.cache_clear()
        self.assertEqual(a,engine.analyze(b))
    def test_ocr_leaves_missing_details_unknown(self):
        result=engine.parse_ocr([{'lines':[{'text':'Raichu','confidence':.99,'x':.1,'y':.1},{'text':'Lv. 30','confidence':.99,'x':.1,'y':.2},{'text':'Adamant','confidence':.99,'x':.1,'y':.7}]}])
        self.assertEqual(result['fields']['species'],'RAICHU');self.assertEqual(result['fields']['level'],30)
        self.assertNotIn('skillLevel',result['fields']);self.assertNotIn('ingredients',result['fields'])

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old_data,self.old_db=storage.DATA,storage.DB
        storage.DATA=Path(self.temp.name);storage.DB=storage.DATA/'test.sqlite3';storage.initialize()
    def tearDown(self):storage.DATA,self.old_data=self.old_data,None;storage.DB=self.old_db;self.temp.cleanup()
    def test_save_reload_edit_history_and_normalized_metrics(self):
        b=build();pid=storage.save(b);self.assertEqual(storage.get_pokemon(pid)['analysis']['build'],b)
        b['level']=60;storage.save(b,pokemon_id=pid)
        self.assertEqual(len(storage.list_pokemon()),1);self.assertEqual(storage.get_pokemon(pid)['historyCount'],2)
        with storage.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM daily_metrics').fetchone()[0],2)
            self.assertGreater(db.execute('SELECT count(*) FROM ingredient_metrics').fetchone()[0],2)
    def test_restore_merges_without_duplicates(self):
        pid=storage.save(build());backup=storage.backup()
        self.assertEqual(storage.restore(backup),{'added':0,'skipped':1})
        backup['pokemon'][0]['id']=str(uuid.uuid4())
        self.assertEqual(storage.restore(backup),{'added':1,'skipped':0})
        self.assertEqual(len(storage.list_pokemon()),2)
    def test_restore_validates_entire_batch_before_writing(self):
        storage.save(build());data=storage.backup();data['pokemon'][0]['id']=str(uuid.uuid4())
        data['pokemon'].append({'id':str(uuid.uuid4()),'build':{'species':'FAKE'}})
        with self.assertRaises(ValueError):storage.restore(data)
        self.assertEqual(len(storage.list_pokemon()),1)
    def test_invalid_screenshot_does_not_save_partial_pokemon(self):
        with self.assertRaises(ValueError):storage.save(build(),image_ids=['missing'])
        self.assertEqual(storage.list_pokemon(),[])
    def test_delete_cascades(self):
        pid=storage.save(build())
        with storage.connect() as db:
            db.execute('DELETE FROM pokemon WHERE id=?',(pid,))
            self.assertEqual(db.execute('SELECT count(*) FROM analyses').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM daily_metrics').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM ingredient_metrics').fetchone()[0],0)

if __name__=='__main__':unittest.main()
