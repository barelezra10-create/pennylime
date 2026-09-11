const fs = require('node:fs');
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const folder=process.argv[3];
const contentTables=['Article','PlatformPage','StatePage','ToolPage','ComparisonPage','LandingPage'];
const messageTables=['EmailTemplate','EmailSequence','SmsTemplate','SmsSequence','EmailCampaign'];
const tables=[...contentTables,...messageTables];
async function main(){
 if(!folder)throw Error('Pass an audit directory as the third argument');
 const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
 try {
 if(['export','export-messages'].includes(process.argv[2])){
  const data={};
  for(const table of process.argv[2]==='export' ? contentTables : messageTables){
   const filter=table==='EmailCampaign' ? ` WHERE status IN ('DRAFT','SCHEDULED')` : '';
   data[table]=(await c.query(`SELECT * FROM "${table}"${filter}`)).rows;
  }
  fs.writeFileSync(folder+'/content-before.json',JSON.stringify(data,null,2));
  console.log(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])));
 }else if(process.argv[2]==='apply'){
  const changes=JSON.parse(fs.readFileSync(folder+'/content-changes.json','utf8'));
  await c.query('BEGIN');
  for(const {table,id,field,before,after} of changes){
   if(!tables.includes(table)||!/^\w+$/.test(field))throw Error('Invalid change');
   const r=await c.query(`UPDATE "${table}" SET "${field}"=$1, "updatedAt"=NOW() WHERE id=$2 AND "${field}" IS NOT DISTINCT FROM $3`,[after,id,before]);
   if(r.rowCount!==1)throw Error('Content changed since snapshot: '+table+'/'+id+'/'+field);
  }
  await c.query('COMMIT');console.log('Updated '+changes.length+' content fields');
 }else if(process.argv[2]==='verify'){
  const changes=JSON.parse(fs.readFileSync(folder+'/content-changes.json','utf8'));
  for(const {table,id,field,after} of changes){
   if(!tables.includes(table)||!/^\w+$/.test(field))throw Error('Invalid change');
   const r=await c.query(`SELECT "${field}" FROM "${table}" WHERE id=$1`,[id]);
   if(r.rows[0]?.[field]!==after)throw Error('Verification failed: '+table+'/'+id+'/'+field);
  }
  console.log('Verified all '+changes.length+' updated content fields');
 }else throw Error('Use export, apply, or verify');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exit(1)});
