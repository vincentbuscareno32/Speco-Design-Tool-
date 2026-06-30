// ── SUPABASE CONFIG ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://pgtafdnljrvllsiwuiyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gqs8lzK5duEgFt5GICIKLQ_6nCSQd9n';

const CAT_COLORS = {
  'Cameras':'#003087','Recorders':'#00AEEF','Audio':'#E65100','Access Control':'#7B1FA2',
  'Networking':'#1565C0','Mounts & Housings':'#546E7A','Power':'#F9A825',
  'Cabling & Connectors':'#2E7D32','Displays':'#0277BD','Optics & Illuminators':'#BF360C',
  'Software & Licenses':'#1B5E20','Accessories':'#4E342E'
};
function cc(c){return CAT_COLORS[c]||'#555'}

let PRODUCTS = [];
let CATS = ['All'];

async function loadProducts() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=sku,description,map,category&order=sku.asc&limit=2000`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) throw new Error('Failed to fetch products');
    PRODUCTS = await res.json();
    CATS = ['All', ...[...new Set(PRODUCTS.map(p => p.category))].sort()];
    console.log(`Loaded ${PRODUCTS.length} products from Supabase`);
    renderProducts();
  } catch (err) {
    console.error('Supabase fetch failed:', err);
    PRODUCTS = [];
    CATS = ['All'];
  }
}

loadProducts();
