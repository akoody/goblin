// Literal substring matching, not SQL wildcard syntax supplied by the client.
export function loginIpSearch(query) {
  if (query != null && typeof query !== 'string') throw Object.assign(new Error('Некорректный поисковый запрос'),{status:400});
  const term=(query||'').trim().slice(0,160);
  if(!term)return {where:'',params:[],term};
  const like=v=>`%${v.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`;
  const fields=['u.username','u.email','CAST(l.user_id AS CHAR)','l.ip','l.previous_ip','l.device_model','l.user_agent'];
  return {term,where:`WHERE (${fields.map(f=>`${f} LIKE ? ESCAPE '!'`).join(' OR ')})`,params:fields.map((_,i)=>like(i===2?term.replace(/^#(?=\d+$)/,''):term))};
}
