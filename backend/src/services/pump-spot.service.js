import {db} from '../config/db.js';

export const pumpPairPattern=/^PUMP-[0-9A-F]{32}-USDT$/;
export const pumpPairSymbol=id=>`PUMP-${id.replaceAll('-','').toUpperCase()}-USDT`;

export async function listPumpPairs(){
  const [rows]=await db.query("SELECT id,mint,name,symbol FROM pump_launches WHERE status='completed' ORDER BY created_at DESC,id");
  return rows.map(row=>({id:pumpPairSymbol(row.id),mint:row.mint,name:row.name,ticker:row.symbol.toUpperCase()}));
}

export async function getPumpPair(symbol,executor=db){
  const hex=symbol.slice(5,37);
  const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-').toLowerCase();
  const [[row]]=await executor.execute("SELECT mint FROM pump_launches WHERE id=? AND status='completed'",[id]);
  if(!row)throw Object.assign(new Error('Спотовая пара не найдена.'),{status:400});
  return row;
}

export async function pumpSpotSnapshot(symbol){
  await getPumpPair(symbol);
  const [[last]]=await db.execute(`SELECT price FROM trading_fills WHERE market='SPOT' AND symbol=?
    ORDER BY created_at DESC,id DESC LIMIT 1`,[symbol]);
  const [candles]=await db.execute(`WITH hourly AS (
    SELECT FLOOR(UNIX_TIMESTAMP(created_at)/3600)*3600000 AS time,price,quantity,
      ROW_NUMBER() OVER (PARTITION BY FLOOR(UNIX_TIMESTAMP(created_at)/3600) ORDER BY created_at,id) AS first_fill,
      ROW_NUMBER() OVER (PARTITION BY FLOOR(UNIX_TIMESTAMP(created_at)/3600) ORDER BY created_at DESC,id DESC) AS last_fill
    FROM trading_fills WHERE market='SPOT' AND symbol=? AND created_at>=NOW()-INTERVAL 48 HOUR
  )
  SELECT time,MAX(CASE WHEN first_fill=1 THEN price END) AS open,MAX(price) AS high,MIN(price) AS low,
    MAX(CASE WHEN last_fill=1 THEN price END) AS close,SUM(quantity) AS volume
  FROM hourly GROUP BY time ORDER BY time`,[symbol]);
  return {price:last?.price??null,candles};
}

export async function changePumpHolding(connection,userId,mint,balance,locked){
  if(balance.gt(0)){
    await connection.execute(`INSERT INTO solana_holdings(user_id,mint,decimals,amount_atomic)
      VALUES (?,?,6,0) ON DUPLICATE KEY UPDATE mint=VALUES(mint)`,[userId,mint]);
  }
  const delta=balance.mul(1_000_000).toFixed(0);
  const reserve=locked.mul(1_000_000).toFixed(0);
  const [result]=await connection.execute(`UPDATE solana_holdings
    SET amount_atomic=amount_atomic+CAST(? AS DECIMAL(65,0)),locked_atomic=locked_atomic+CAST(? AS DECIMAL(65,0))
    WHERE user_id=? AND mint=? AND decimals=6
      AND locked_atomic+CAST(? AS DECIMAL(65,0))>=0
      AND amount_atomic+CAST(? AS DECIMAL(65,0))>=locked_atomic+CAST(? AS DECIMAL(65,0))`,
    [delta,reserve,userId,mint,reserve,delta,reserve]);
  if(result.affectedRows!==1)throw Object.assign(new Error('Недостаточно доступных токенов.'),{status:409});
}
