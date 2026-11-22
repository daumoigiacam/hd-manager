import {register} from 'node:module';
import {installCanonicalSourceReads} from './canonical-source-reads.mjs';
installCanonicalSourceReads();
register('./canonical-source-loader.mjs', import.meta.url);
