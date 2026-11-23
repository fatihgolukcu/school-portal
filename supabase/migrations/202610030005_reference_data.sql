-- Versioned reference data derived from the supplied integrated Word document.
-- The document's 49 academic criteria are preserved in Turkish and translated
-- into English. No sample children, parents, credentials or invented level names.
insert into public.school_settings(id) values(true);
insert into public.academic_years(id,name,starts_on,ends_on) values('10000000-0000-0000-0000-000000000001','2026–2027','2026-09-01','2027-08-31');
insert into public.periods(academic_year_id,number,name_en,name_tr)
select '10000000-0000-0000-0000-000000000001',n,'Period '||n,'Dönem '||n from generate_series(1,4) n;
insert into public.subjects(id,code,name_en,name_tr) values
('20000000-0000-0000-0000-000000000001','B1','Language Skills','Dil Becerileri'),
('20000000-0000-0000-0000-000000000002','B2','History','Tarih'),
('20000000-0000-0000-0000-000000000003','B3','Stories & Biographies','Hikâyeler ve Biyografiler'),
('20000000-0000-0000-0000-000000000004','B4','Values Education','Değerler Eğitimi'),
('20000000-0000-0000-0000-000000000005','B5','Knowledge Track','Bilgi Rotası');
insert into public.levels(code,name_en,name_tr,kind) select code,code,code,'specialist' from unnest(array['C1','C2','C3','T1','T2','T3']) code;
insert into public.packages(id,code,name_en,name_tr,weekly_lessons,currency) values
('30000000-0000-0000-0000-000000000001','full','Full Package','Tam Paket',null,'EUR'),
('30000000-0000-0000-0000-000000000002','specialist','Specialist School','Uzmanlık Okulu',null,'EUR'),
('30000000-0000-0000-0000-000000000003','weekend','Weekend School','Hafta Sonu Okulu',null,'EUR');
insert into public.package_subjects(package_id,subject_id) select '30000000-0000-0000-0000-000000000001',id from public.subjects;
insert into public.package_subjects(package_id,subject_id) values('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
insert into public.package_subjects(package_id,subject_id) select '30000000-0000-0000-0000-000000000003',id from public.subjects where code<>'B1';

with academic(id,subject_code,position,label_tr,label_en) as (values
('B1.1','B1',1,'Simge tanıma','Symbol recognition'),
('B1.2','B1',2,'Doğru telaffuz','Correct pronunciation'),
('B1.3','B1',3,'Kuralları uygulama','Applying the rules'),
('B1.4','B1',4,'Akıcı okuma','Fluent reading'),
('B1.5','B1',5,'Ezberleme','Memorisation'),
('B1.6','B1',6,'Ev çalışması','Home practice'),
('B2.1','B2',1,'Dönemin önemli kişilerini ve ortamını bilir.','Knows the key figures and setting of the period.'),
('B2.2','B2',2,'Dönemin temel kavramlarını açıklar.','Explains key concepts of the period.'),
('B2.3','B2',3,'Karakter özelliklerini örneklerle açıklar.','Explains character traits with examples.'),
('B2.4','B2',4,'Olayların yayılmasını neden-sonuç ilişkisiyle anlatır.','Describes how events spread through cause and effect.'),
('B2.5','B2',5,'Zor dönemlerdeki sabrı ve yöntemleri açıklar.','Explains patience and approaches used in hard times.'),
('B2.6','B2',6,'Göçü toplum inşası olarak analiz eder.','Analyses migration as a process of building a community.'),
('B2.7','B2',7,'Bir örnek olay üzerinden adalet ve diplomasiyi yorumlar.','Interprets justice and diplomacy through a case study.'),
('B2.8','B2',8,'Önemli bir olayın anlamını analiz eder.','Analyses the meaning of a key event.'),
('B2.9','B2',9,'Önemli şahsiyetlerin etkisini değerlendirir.','Evaluates the influence of key figures.'),
('B3.1','B3',1,'Örnek kişilerin neden önemli olduğunu açıklar.','Explains why role models matter.'),
('B3.2','B3',2,'Olayları sebep-sonuç ilişkisiyle anlatır.','Describes events through cause and effect.'),
('B3.3','B3',3,'Dikkat çekici olayları doğru kavrar.','Understands remarkable events accurately.'),
('B3.4','B3',4,'Güzel ahlakı örnek alır.','Takes good character as an example.'),
('B3.5','B3',5,'Sabır ve güveni anlar.','Understands patience and trust.'),
('B3.6','B3',6,'Samimiyeti kavrar.','Understands sincerity.'),
('B3.7','B3',7,'Bir hikâyenin ana mesajını anlar.','Understands the central message of a story.'),
('B3.8','B3',8,'Kaynakların önemini açıklar.','Explains the importance of sources.'),
('B3.9','B3',9,'Günümüzle bağlantı kurar.','Connects the lessons to the present day.'),
('B3.10','B3',10,'Empati geliştirir.','Develops empathy.'),
('B3.11','B3',11,'Soru sorar ve düşünür.','Asks questions and reflects.'),
('B4.1','B4',1,'Sevgi ve saygı: Çevresindeki kişilere sevgi ve saygı çerçevesinde yaklaşır.','Love and respect: treats people with love and respect.'),
('B4.2','B4',2,'Doğruluk ve karakter: Söz ve davranışlarında dürüsttür.','Honesty and character: is truthful in words and actions.'),
('B4.3','B4',3,'Duygu yönetimi: Kendi duygularını tanır ve yönetme becerisi gösterir.','Managing emotions: recognises and manages personal feelings.'),
('B4.4','B4',4,'Adalet ve hakkaniyet: Olaylara adil yaklaşır ve hakkaniyete uygun davranır.','Justice and fairness: approaches situations fairly and acts justly.'),
('B4.5','B4',5,'Empati ve nezaket: Başkalarının duygularını anlar ve nazik davranır.','Empathy and kindness: understands others’ feelings and acts kindly.'),
('B4.6','B4',6,'Sorumluluk bilinci: Verilen görev ve sorumlulukları zamanında yerine getirir.','Responsibility: completes assigned duties on time.'),
('B4.7','B4',7,'Zorbalıkla mücadele: Çevresindeki zorbalıklara karşı duyarlıdır.','Challenging bullying: is alert and responsive to bullying.'),
('B4.8','B4',8,'Çevre bilinci: Çevre duyarlılığı gelişmiştir, doğayı korur.','Environmental awareness: cares for the environment and protects nature.'),
('B4.9','B4',9,'Tasarruf ve tüketim ahlakı: Kaynakları israf etmeden kullanır.','Responsible consumption: uses resources without waste.'),
('B4.10','B4',10,'Dijital etik: Online platform kurallarına uyar.','Digital ethics: follows online platform rules.'),
('B4.11','B4',11,'Sağlıklı yaşam: Kendi sağlığına ve temizliğine dikkat eder.','Healthy living: cares for personal health and cleanliness.'),
('B4.12','B4',12,'Çalışkanlık ve azim: Zorluklar karşısında pes etmez, gayret gösterir.','Diligence and perseverance: makes an effort and does not give up.'),
('B4.13','B4',13,'Toplumsal dayanışma: Arkadaşlarıyla yardımlaşır.','Community support: helps and cooperates with friends.'),
('B4.14','B4',14,'Rol model: Örnek aldığı kişilerin güzel davranışlarını uygular.','Role models: follows the good example of admired people.'),
('B4.15','B4',15,'Derinlik: Olaylara daha derin anlam arama becerisi gösterir.','Reflection: looks for deeper meaning in events.'),
('B5.1','B5',1,'Temel ilkeleri sıralar ve açıklar.','Lists and explains core principles.'),
('B5.2','B5',2,'Temel bir inancı açıkça ifade eder.','Expresses a core belief clearly.'),
('B5.3','B5',3,'Temel kavramları doğru kullanır.','Uses basic concepts correctly.'),
('B5.4','B5',4,'Rotanın temellerini açıklar.','Explains the foundations of the track.'),
('B5.5','B5',5,'Uygulamaları doğru yapar.','Performs practices correctly.'),
('B5.6','B5',6,'Uygulamanın iç boyutunu kavrar.','Understands the inner dimension of practice.'),
('B5.7','B5',7,'Uygulamaların toplumsal yönünü açıklar.','Explains the social aspects of practice.'),
('B5.8','B5',8,'Konular arası ilişki kurar ve analiz eder.','Connects and analyses relationships between topics.')
), question_list as (
  select jsonb_agg(jsonb_build_object('id',id,'subject_code',subject_code,'form',subject_code,'type','score','label_en',label_en,'label_tr',label_tr,'required',true,'min',1,'max',5,'order',position) order by subject_code,position) as questions from academic
)
insert into public.configurations(id,kind,version,name,status,body,published_at)
select '40000000-0000-0000-0000-000000000001','assessment',1,'Initial curriculum / Başlangıç müfredatı','published',
  jsonb_build_object('questions',questions||'[
    {"id":"A4.focus","form":"A4","type":"score","label_en":"Focus during lessons","label_tr":"Derse odaklanma","required":true,"min":1,"max":5,"order":1},
    {"id":"A4.activities","form":"A4","type":"score","label_en":"Activities and projects","label_tr":"Etkinlik ve projeler","required":true,"min":1,"max":5,"order":2},
    {"id":"A4.communication","form":"A4","type":"score","label_en":"Communication with the teacher","label_tr":"Öğretmenle iletişim","required":true,"min":1,"max":5,"order":3},
    {"id":"A5.respect","form":"A5","type":"score","label_en":"Respect for classmates","label_tr":"Arkadaşlara saygı","required":true,"min":1,"max":5,"order":1},
    {"id":"A5.rules","form":"A5","type":"score","label_en":"Following class routines","label_tr":"Ders düzenine uyum","required":true,"min":1,"max":5,"order":2},
    {"id":"A6.strengths","form":"A6","type":"text","label_en":"Strengths","label_tr":"Güçlü yönler","required":true,"order":1},
    {"id":"A6.development","form":"A6","type":"text","label_en":"Development areas","label_tr":"Gelişim alanları","required":true,"order":2},
    {"id":"A6.advice","form":"A6","type":"text","label_en":"Advice for parents","label_tr":"Veliye öneriler","required":true,"order":3},
    {"id":"A6.effort","form":"A6","type":"score","label_en":"Overall development effort","label_tr":"Genel gelişim çabası","required":true,"min":1,"max":5,"order":4}
  ]'::jsonb),now() from question_list;

insert into public.configurations(id,kind,version,name,status,body,published_at) values
('40000000-0000-0000-0000-000000000002','grading',1,'Initial grading / Başlangıç puanlama','published','{
  "overall":{"discipline":0.3,"academic":0.5,"effort":0.2},
  "discipline":{"attendance":0.4,"participation":0.3,"behaviour":0.3},
  "participation":{"a3":0.5,"a4":0.5},
  "attendance_scores":{"present":5,"late":3,"absent":0},
  "academic":{"mode":"average","weights":{}},
  "bands":[
    {"min":0,"key":"risk","label_en":"Needs close support","label_tr":"Risk grubu","color":"red"},
    {"min":2.5,"key":"developing","label_en":"Development needed","label_tr":"Gelişim gerekli","color":"orange"},
    {"min":3,"key":"steady","label_en":"Steady progress","label_tr":"Normal ilerleme","color":"yellow"},
    {"min":4,"key":"good","label_en":"Progressing well","label_tr":"İyi ilerliyor","color":"green"},
    {"min":4.5,"key":"excellent","label_en":"Progressing very well","label_tr":"Çok iyi ilerliyor","color":"green"}
  ]
}',now()),
('40000000-0000-0000-0000-000000000003','triggers',1,'Initial guidance rules / Başlangıç rehberlik kuralları','published','{
 "review_hours":48,"escalation_hours":72,"orange_escalation_days":14,
 "rules":[
  {"id":"absence_sequence","label_en":"Three consecutive unexcused absences","label_tr":"Ardışık üç izinsiz devamsızlık","severity":"red","enabled":true,"condition":{"metric":"consecutive_absences","operator":"gte","value":3,"min_observations":1}},
  {"id":"attendance_low","label_en":"Attendance score below 60%","label_tr":"Yoklama puanı %60 altında","severity":"orange","enabled":true,"condition":{"metric":"attendance_average","operator":"lt","value":3,"min_observations":3}},
  {"id":"camera_incidents","label_en":"Three camera or microphone incidents within 21 days","label_tr":"21 günde üç kamera veya mikrofon sorunu","severity":"orange","enabled":true,"condition":{"metric":"camera_incidents","operator":"gte","value":3,"min_observations":3,"window_days":21}},
  {"id":"participation_low","label_en":"Low active participation","label_tr":"Düşük aktif katılım","severity":"orange","enabled":true,"condition":{"metric":"participation_average","operator":"lte","value":2.5,"min_observations":3}},
  {"id":"engagement_low","label_en":"Low engagement","label_tr":"Düşük derse ilgi","severity":"orange","enabled":true,"condition":{"metric":"engagement_average","operator":"lte","value":2.5,"min_observations":1}},
  {"id":"behaviour_low","label_en":"Behaviour needs support","label_tr":"Davranış desteği gerekli","severity":"orange","enabled":true,"condition":{"any":[{"metric":"behaviour_average","operator":"lte","value":3},{"metric":"behaviour_min","operator":"lte","value":2}]}},
  {"id":"subject_low","label_en":"Subject learning needs support","label_tr":"Ders öğrenimi desteği gerekli","severity":"orange","enabled":true,"condition":{"metric":"subject_average","operator":"lte","value":3}},
  {"id":"criterion_gap","label_en":"Specific learning gap","label_tr":"Belirli kazanım eksikliği","severity":"yellow","enabled":true,"condition":{"all":[{"metric":"academic_min","operator":"lte","value":2},{"metric":"subject_average","operator":"gt","value":3}]}},
  {"id":"report_risk","label_en":"Report indicates close support needed","label_tr":"Karne yoğun destek gerektiriyor","severity":"red","enabled":true,"condition":{"metric":"overall_score","operator":"lt","value":2.5}},
  {"id":"report_development","label_en":"Report indicates development needed","label_tr":"Karne gelişim gerektiriyor","severity":"orange","enabled":true,"condition":{"all":[{"metric":"overall_score","operator":"gte","value":2.5},{"metric":"overall_score","operator":"lt","value":3}]}}
 ]
}',now());
