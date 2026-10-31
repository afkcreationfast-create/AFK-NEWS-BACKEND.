const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false } : false,
  max: 5, connectionTimeoutMillis: 10000
});
app.use(helmet());
app.use(cors());
app.use(express.json({limit:"1mb"}));

const categoryNames = ["Alertes","Haïti","Monde","Loisirs & culture","Sports","Technologie","Économie","Sciences"];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS articles (
      id BIGSERIAL PRIMARY KEY, external_id TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT, content TEXT, url TEXT NOT NULL, image_url TEXT, source TEXT NOT NULL,
      original_language TEXT DEFAULT 'en', translated_title TEXT, translated_summary TEXT,
      category_id BIGINT REFERENCES categories(id), country TEXT,
      importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
      is_published BOOLEAN DEFAULT TRUE, published_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source,external_id)
    );
    CREATE TABLE IF NOT EXISTS afk_announcements (
      id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, image_url TEXT,
      link_url TEXT, announcement_type TEXT DEFAULT 'news', is_published BOOLEAN DEFAULT FALSE,
      published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS refresh_logs (
      id BIGSERIAL PRIMARY KEY, service TEXT NOT NULL, status TEXT NOT NULL,
      articles_found INTEGER DEFAULT 0, articles_added INTEGER DEFAULT 0,
      error_message TEXT, started_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ
    );
  `);
  for (const name of categoryNames) {
    const slug = name.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    await pool.query(`INSERT INTO categories(name,slug) VALUES($1,$2)
      ON CONFLICT(name) DO UPDATE SET slug=EXCLUDED.slug`,[name,slug]);
  }
}

function categoryOf(title, summary) {
  const t = `${title||""} ${summary||""}`.toLowerCase();
  if (/ha.ti|haiti|port-au-prince|cap-ha.tien/.test(t)) return "Haïti";
  if (/football|soccer|basketball|tennis|sport/.test(t)) return "Sports";
  if (/artificial intelligence|technology|software|cyber|startup|tech/.test(t)) return "Technologie";
  if (/econom|business|market|finance/.test(t)) return "Économie";
  if (/science|research|climate|space/.test(t)) return "Sciences";
  if (/music|film|movie|culture|art|festival/.test(t)) return "Loisirs & culture";
  return "Monde";
}

async function collectArticles() {
  const started = new Date();
  let all = [];
  try {
    if (process.env.NEWSAPI_KEY) {
      const u = new URL("https://newsapi.org/v2/top-headlines");
      u.searchParams.set("country",process.env.NEWS_COUNTRY||"us");
      u.searchParams.set("pageSize","50"); u.searchParams.set("apiKey",process.env.NEWSAPI_KEY);
      const r = await fetch(u); if (!r.ok) throw new Error(`NewsAPI HTTP ${r.status}`);
      const d = await r.json();
      all.push(...(d.articles||[]).map(a=>({
        id:a.url||a.title,title:a.title,summary:a.description,content:a.content,
        url:a.url,image:a.urlToImage,source:"newsapi",lang:"en",date:a.publishedAt
      })));
    }
    if (process.env.GNEWS_API_KEY) {
      const u = new URL("https://gnews.io/api/v4/top-headlines");
      u.searchParams.set("lang","en");u.searchParams.set("max","10");u.searchParams.set("apikey",process.env.GNEWS_API_KEY);
      const r = await fetch(u); if (!r.ok) throw new Error(`GNews HTTP ${r.status}`);
      const d = await r.json();
      all.push(...(d.articles||[]).map(a=>({
        id:a.url||a.title,title:a.title,summary:a.description,content:a.content,
        url:a.url,image:a.image,source:"gnews",lang:"en",date:a.publishedAt
      })));
    }
    let added=0;
    for (const a of all) {
      if (!a.title || !a.url || !a.id) continue;
      const cat = await pool.query("SELECT id FROM categories WHERE name=$1",[categoryOf(a.title,a.summary)]);
      const saved = await pool.query(`
        INSERT INTO articles(external_id,title,summary,content,url,image_url,source,original_language,category_id,country,published_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(source,external_id) DO UPDATE SET
          title=EXCLUDED.title,summary=EXCLUDED.summary,image_url=EXCLUDED.image_url,fetched_at=NOW()
        RETURNING (xmax=0) AS inserted`,
        [String(a.id).slice(0,1000),a.title,a.summary,a.content,a.url,a.image,a.source,a.lang,
         cat.rows[0]?.id||null,process.env.NEWS_COUNTRY||null,a.date?new Date(a.date):null]);
      if(saved.rows[0]?.inserted) added++;
    }
    await pool.query(`INSERT INTO refresh_logs(service,status,articles_found,articles_added,started_at,finished_at)
      VALUES('news-providers','success',$1,$2,$3,NOW())`,[all.length,added,started]);
    console.log(`Collecte terminée : ${all.length} trouvés, ${added} nouveaux.`);
    return {found:all.length,added};
  } catch(e) {
    await pool.query(`INSERT INTO refresh_logs(service,status,error_message,started_at,finished_at)
      VALUES('news-providers','error',$1,$2,NOW())`,[e.message.slice(0,1500),started]).catch(()=>{});
    console.error("Collecte actualités :",e.message);
    return {error:e.message};
  }
}

app.get("/",(_req,res)=>res.json({name:"AFK News API",status:"online"}));
app.get("/api/health",async(_req,res)=>{
  try { await pool.query("SELECT 1");res.json({success:true,api:"online",database:"connected"}); }
  catch(e){res.status(503).json({success:false,api:"online",database:"disconnected"});}
});
app.get("/api/categories",async(_req,res)=>{
  try {const r=await pool.query("SELECT id,name,slug FROM categories ORDER BY id");res.json({success:true,data:r.rows});}
  catch(e){res.status(500).json({success:false,error:"Erreur de lecture des catégories."});}
});
app.get("/api/articles",async(req,res)=>{
  try {
    const page=Math.max(1,parseInt(req.query.page,10)||1);
    const limit=Math.min(50,Math.max(1,parseInt(req.query.limit,10)||12));
    const vals=[];let where="WHERE a.is_published=TRUE";
    if(req.query.category){vals.push(String(req.query.category));where+=` AND c.slug=$${vals.length}`;}
    if(req.query.q){vals.push(`%${String(req.query.q).slice(0,120)}%`);where+=` AND (a.title ILIKE $${vals.length} OR a.summary ILIKE $${vals.length})`;}
    const count=await pool.query(`SELECT COUNT(*)::int total FROM articles a LEFT JOIN categories c ON c.id=a.category_id ${where}`,vals);
    vals.push(limit,(page-1)*limit);
    const data=await pool.query(`SELECT a.id,a.title,a.summary,a.url,a.image_url,a.source,
      a.original_language,a.translated_title,a.translated_summary,a.country,a.importance,
      a.published_at,c.name category FROM articles a LEFT JOIN categories c ON c.id=a.category_id
      ${where} ORDER BY a.published_at DESC NULLS LAST,a.created_at DESC
      LIMIT $${vals.length-1} OFFSET $${vals.length}`,vals);
    res.json({success:true,page,limit,total:count.rows[0].total,data:data.rows});
  } catch(e){res.status(500).json({success:false,error:"Erreur de lecture des actualités."});}
});
app.get("/api/announcements",async(_req,res)=>{
  try {const r=await pool.query(`SELECT id,title,description,image_url,link_url,announcement_type,published_at
    FROM afk_announcements WHERE is_published=TRUE ORDER BY published_at DESC NULLS LAST LIMIT 30`);
    res.json({success:true,data:r.rows});}
  catch(e){res.status(500).json({success:false,error:"Erreur de lecture des annonces."});}
});
app.post("/api/admin/refresh-news",async(req,res)=>{
  if(!process.env.ADMIN_REFRESH_TOKEN||req.get("x-admin-token")!==process.env.ADMIN_REFRESH_TOKEN)
    return res.status(401).json({success:false,error:"Non autorisé."});
  res.json({success:true,...await collectArticles()});
});

async function start(){
  if(!process.env.DATABASE_URL){console.error("DATABASE_URL absent des variables Render.");process.exit(1);}
  await initDb();
  app.listen(PORT,()=>console.log(`AFK News API active sur ${PORT}`));
  if(process.env.NEWSAPI_KEY||process.env.GNEWS_API_KEY){
    collectArticles();
    const minutes=Math.max(15,Number(process.env.NEWS_REFRESH_MINUTES||30));
    setInterval(collectArticles,minutes*60*1000);
    console.log(`Collecte planifiée toutes les ${minutes} minutes.`);
  } else console.log("Aucune clé d'actualité : collecte non activée.");
}
process.on("SIGTERM",async()=>{await pool.end();process.exit(0);});
start().catch(e=>{console.error("Démarrage impossible :",e);process.exit(1);});
