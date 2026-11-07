// Mechanical adaptation of the copied Next.js screens and compilation of the
// original domain module. Business changes stay in backend/market-source/db.ts.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd(),app=path.join(root,'apps/market');
const contractPath=path.join(app,'src/lib/db-contract.ts');
const contract=fs.readFileSync(contractPath,'utf8');
const source=ts.createSourceFile(contractPath,contract,ts.ScriptTarget.Latest,true);
const exported=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>n.name.text);
const typeNames=source.statements.filter(n=>ts.isTypeAliasDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>n.name.text);
fs.writeFileSync(path.join(app,'src/lib/db.ts'),`// Generated typed adapter; data is managed by the exchange backend.\nimport type * as Contract from './db-contract';\nimport {marketRpc} from './market-rpc';\nexport type {${typeNames.join(',')}} from './db-contract';\n`+exported.map(name=>`export async function ${name}(...args:Parameters<typeof Contract.${name}>):Promise<ReturnType<typeof Contract.${name}>> {return marketRpc('${name}',args);}`).join('\n')+'\n');
function walk(dir) {
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()) {walk(file);continue;}
    if(!/\.tsx?$/.test(file)||file.includes('/lib/'))continue;
    let value=fs.readFileSync(file,'utf8');
    const parsed=ts.createSourceFile(file,value,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const imports=new Set();
    for(const node of parsed.statements)if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text==='@/lib/db'&&!node.importClause?.isTypeOnly){for(const name of node.importClause?.namedBindings?.elements||[])if(!name.isTypeOnly)imports.add(name.name.text);}
    const edits=[],asyncNodes=new Set();
    function visit(node) {
      let parent=node.parent; while(parent&&ts.isParenthesizedExpression(parent))parent=parent.parent;
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&imports.has(node.expression.text)&&!ts.isAwaitExpression(parent)) {
        edits.push({start:node.getStart(parsed),end:node.end,value:`(await ${node.getText(parsed)})`});
        let current=node.parent;
        while(current&&!ts.isFunctionLike(current))current=current.parent;
        if(current&&!current.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))asyncNodes.add(current);
      }
      ts.forEachChild(node,visit);
    }
    visit(parsed);
    for(const node of asyncNodes) {
      const position=ts.isArrowFunction(node)?node.getStart(parsed):value.indexOf('function',node.getStart(parsed));
      edits.push({start:position,end:position,value:'async '});
    }
    for(const edit of edits.sort((a,b)=>b.start-a.start))value=value.slice(0,edit.start)+edit.value+value.slice(edit.end);
    value=value.replace(/(?<!Awaited<)ReturnType<typeof getCatalogLibrary>/g,'Awaited<ReturnType<typeof getCatalogLibrary>>');
    value=value.replace(/import \{ revalidatePath \} from "next\/cache";/g,'import { revalidatePath } from "@/lib/market-navigation";');
    value=value.replace(/import \{ redirect \} from "next\/navigation";/g,'import { redirect } from "@/lib/market-navigation";');
    value=value.replace(/action="\/(?!market(?:\/|"))([^"\n]*)"/g,(_,tail)=>`action="/market${tail?'/'+tail:''}"`);
    fs.writeFileSync(file,value);
  }
}
walk(path.join(app,'src'));
const output=path.join(root,'backend/market-runtime');fs.mkdirSync(output,{recursive:true});
for(const name of ['db','marketplace-catalog']) {
  let value=fs.readFileSync(path.join(root,'backend/market-source',name+'.ts'),'utf8');
  value=value.replaceAll('"@/lib/marketplace-catalog"','"./marketplace-catalog.js"');
  fs.writeFileSync(path.join(output,name+'.js'),ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
console.log('Prepared original market screens and domain runtime.');
