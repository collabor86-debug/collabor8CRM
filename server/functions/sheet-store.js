import {googleJson,response,fail} from './_google.js';
import {readSession, isOwner, requestOriginAllowed} from './_session.js';

const ALLOWED_SHEETS=new Set([
 'cabins','occupants','payments','invoices','leads','quotations',
 'virtual_office','bookings','documents','settings','audit_logs',
 'vacated_clients','maintenance','inventory','vendors','expenses',
 'automation','integrations'
]);
const ADMIN_ONLY=new Set(['settings','audit_logs']);
const auth=e=>readSession(e.headers?.cookie||e.headers?.Cookie);
function body(e){try{return JSON.parse(e.body||'{}')}catch{return null}}

function spreadsheetId(){
 const id=process.env.GOOGLE_SHEET_ID;
 if(!id) throw new Error('Missing GOOGLE_SHEET_ID');
 return id;
}

async function ensureSheet(name){
 const id=spreadsheetId();
 const meta=await googleJson(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties`
 );
 const exists=(meta.sheets||[]).some(s=>s.properties?.title===name);
 if(exists)return;
 await googleJson(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,
  {
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({requests:[{addSheet:{properties:{title:name}}}]})
  }
 );
}

async function read(name){
 const id=spreadsheetId();
 await ensureSheet(name);
 const range=encodeURIComponent(`${name}!A:ZZ`);
 const x=await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}`);
 const rows=x.values||[];
 if(!rows.length)return [];
 return rows.slice(1).map(r=>Object.fromEntries(rows[0].map((h,i)=>[h,r[i]??''])));
}

async function write(name,rows){
 const id=spreadsheetId();
 await ensureSheet(name);
 const range=encodeURIComponent(`${name}!A:ZZ`);
 const headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];
 const values=headers.length
<<<<<<< HEAD
  ? [headers,...rows.map(r=>headers.map(h=>typeof r[h]==='object'?JSON.stringify(r[h]):r[h]??''))]
=======
  ? [headers,...rows.map(r=>headers.map(h=>{const v=r[h];if(v===null||v===undefined)return '';return typeof v==='object'?JSON.stringify(v):v;}))]
>>>>>>> 72c0e6d (Update Collabor8 CRM)
  : [];
 await googleJson(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}:clear`,
  {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}
 );
 if(values.length){
  await googleJson(
   `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}?valueInputOption=USER_ENTERED`,
   {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({majorDimension:'ROWS',values})
   }
  );
 }
}

export async function handler(event){
 const user=auth(event);if(!user)return fail(401,'UNAUTHENTICATED','Sign in required.');if(event.httpMethod!=='GET'&&!requestOriginAllowed(event))return fail(403,'FORBIDDEN','Cross-origin request blocked.');
 try{
  if(event.httpMethod==='GET'){
   const sheet=event.queryStringParameters?.sheet;
   if(!sheet||!ALLOWED_SHEETS.has(sheet))return fail(400,'VALIDATION_ERROR','Invalid sheet.');
   if(ADMIN_ONLY.has(sheet)&&user.role!=='admin')return fail(403,'FORBIDDEN','Admin access required.');
   return response(200,{success:true,data:await read(sheet)},{'Cache-Control':'no-store'});
  }

  if(event.httpMethod!=='POST')return fail(405,'METHOD_NOT_ALLOWED','GET or POST required.');

  const b=body(event)||{};
  if(isOwner(user))return fail(403,'FORBIDDEN','Owner accounts are read-only.');
  if(ADMIN_ONLY.has(b.sheet)&&user.role!=='admin')return fail(403,'FORBIDDEN','Admin access required.');
  if(b.sheet==='audit_logs')return fail(403,'FORBIDDEN','Audit logs cannot be modified directly.');
  if(!ALLOWED_SHEETS.has(b.sheet)||!Array.isArray(b.data))
    return fail(400,'VALIDATION_ERROR','Valid sheet and data array required.');

  await write(b.sheet,b.data);

  // Audit logging is best-effort. A logging problem must never make a
  // successful CRM data write look like a failed Google Sheets save.
  if(b.sheet!=='audit_logs'){
   try{
    const logs=await read('audit_logs');
    logs.push({
     id:`AUD-${String(logs.length+1).padStart(5,'0')}`,
     timestamp:new Date().toISOString(),
     userId:user.username||'',
     action:'SYNC_SHEET',
     entity:b.sheet,
     details:JSON.stringify({rows:b.data.length})
    });
    await write('audit_logs',logs);
   }catch(error){
    console.error('Audit log write failed:',error?.stack||error);
   }
  }

  return response(200,{success:true,rows:b.data.length});
 }catch(e){
  console.error('SHEET STORE ERROR:',e?.stack||e);
  return fail(500,'SHEET_STORE_ERROR',e?.message||'Unable to access Google Sheets.');
 }
}
