const pending=new WeakMap();
export function beginPostCommit(connection){pending.set(connection,[]);}
export function afterCommit(connection,callback){
 const tasks=pending.get(connection);
 if(!tasks)throw new Error('Post-commit callback requires a managed transaction');
 tasks.push(callback);
}
export function finishPostCommit(connection,committed){
 const tasks=pending.get(connection)||[];
 pending.delete(connection);
 if(committed)for(const task of tasks){try{task();}catch{console.error('Post-commit notification failed');}}
}
