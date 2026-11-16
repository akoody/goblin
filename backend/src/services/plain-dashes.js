export const plainDashes=value=>typeof value==='string'?value.replace(/[\u2013\u2014]/g,'-'):value;
export const plainArticle=row=>({...row,title:plainDashes(row.title),body:plainDashes(row.body)});
