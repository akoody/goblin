// Админка, раздел «Доступность разделов платформы». Состояние и загрузка в хуке usePlatformFeaturesAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в PlatformFeaturesSection.
import { useEffect, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";

export function usePlatformFeaturesAdmin({  } = {}) {
  const [platformFeatures, setPlatformFeatures] = useState({ p2p: true, processing: true, nft: true, market:true,guarantor:true });
  const [platformFeaturesLoading, setPlatformFeaturesLoading] = useState(false);
  const [platformFeatureSaving,setPlatformFeatureSaving]=useState(null);
  const loadPlatformFeatures = (silent = false) => {
    if (!silent) setPlatformFeaturesLoading(true);
    api.get("/admin/features")
      .then((response) => setPlatformFeatures(response.data || {}))
      .catch((error) => {
        if (!silent) enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить доступность разделов"), { variant: "error" });
      })
      .finally(() => setPlatformFeaturesLoading(false));
  };
  const handlePlatformFeatureChange = (feature, enabled) => {
    if(platformFeatureSaving)return;
    setPlatformFeatureSaving(feature);
    api.patch(`/admin/features/${feature}`, { enabled })
      .then((response) => {
        setPlatformFeatures(response.data || {});
        enqueueSnackbar(enabled ? "Раздел включен" : "Раздел переведен на обновление", { variant: "success" });
      })
      .catch((error) => enqueueSnackbar(getApiErrorMessage(error, "Не удалось обновить раздел"), { variant: "error" }))
      .finally(()=>setPlatformFeatureSaving(null));
  };

  useEffect(() => {
    loadPlatformFeatures(true);
  }, []);

  return { handlePlatformFeatureChange, loadPlatformFeatures, platformFeatureSaving, platformFeatures, platformFeaturesLoading, setPlatformFeatureSaving, setPlatformFeatures, setPlatformFeaturesLoading };
}

export function PlatformFeaturesSection({ handlePlatformFeatureChange, loadPlatformFeatures, platformFeatureSaving, platformFeatures, platformFeaturesLoading }) {
  return (
 (
        <section className={styles.admin_deals}>
          <div className={styles.admin_dealsTop}>
            <div><h2>Доступность разделов</h2><p>Управляйте доступом к разделам и торговле фьючерсами.</p></div>
            <button type="button" onClick={() => loadPlatformFeatures()} disabled={platformFeaturesLoading}><FiRefreshCw /> Обновить</button>
          </div>
          <div className={styles.admin_featureGrid}>
            {[['p2p', 'P2P рынок'], ['processing', 'Процессинг'], ['nft', 'NFT Market'],['market','Маркет'],['guarantor','Гарант'],['futures','Фьючерсы']].map(([feature, label]) => (
              <article key={feature}>
                <div><strong>{label}</strong><span>{platformFeatures[feature] === false ? "На обновлении" : "Доступен"}</span></div>
                <button type="button" disabled={platformFeaturesLoading||Boolean(platformFeatureSaving)} aria-label={`${platformFeatures[feature]===false?'Включить':'Отключить'} ${label}`} className={platformFeatures[feature] === false ? styles.admin_featureOff : ""} onClick={() => handlePlatformFeatureChange(feature, platformFeatures[feature] === false)}>{platformFeatureSaving===feature?'Сохраняем…':platformFeatures[feature] === false ? "Включить" : "Отключить"}</button>
                {feature==='futures'&&<p>Перед отключением закройте позиции и отмените активные ордера.</p>}
              </article>
            ))}
          </div>
        </section>
      )
  );
}
