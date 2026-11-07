import styles from './Swap.module.scss';
const amount=value=>String(value??'0').replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1').replace('.',',');
export function LaunchTariff({policy,buySol}){
 return <section className={styles.tariff} aria-label="Стоимость создания мемкоина"><h3>Тариф биржи за создание</h3><dl><div><dt>Комиссия Goblin</dt><dd>{amount(policy.service_fee_sol)} SOL</dd></div><div><dt>Первая покупка токенов</dt><dd>{buySol?amount(buySol):'—'} SOL</dd></div><div><dt>Резерв расходов сети</dt><dd>до {amount(policy.network_budget_sol)} SOL</dd></div></dl><p>Тариф биржи оплачивается отдельно от первой покупки и поступает во внутреннюю казну только после успешного создания мемкоина. При неуспехе тариф не взимается; фактические расходы сети могут быть списаны. Неиспользованный резерв освобождается.</p><p>Полную сумму заморозки покажем после нажатия «Рассчитать запуск» — до вашего подтверждения.</p></section>;
}
