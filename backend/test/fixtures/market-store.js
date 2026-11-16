import * as domain from '../../market-runtime/db.js';
import {catalogBlueprints} from '../../market-runtime/marketplace-catalog.js';

export function populatedMarketFixture() {
  return domain.withMarketStore(domain.createProductionStore(),()=>{
    for(const item of catalogBlueprints)domain.createCatalogItemRecord({...item,area:'both'});
  }).payload;
}
