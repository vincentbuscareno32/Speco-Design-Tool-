
// ── CAMERA SPECS & DORI ───────────────────────────────────────────────────
const LENS_FOV={1.68:180,1.8:170,2.1:155,2.2:140,2.5:130,2.8:107,2.9:105,3.6:88,4:78,6:54,8:38,12:28,16:21,25:14};
const SENSOR_W_MM={'1/1.8':7.18,'1/2':6.40,'1/2.5':5.76,'1/2.7':5.37,'1/2.8':5.37,'1/3':4.80,'1/3.2':4.54,'1/4':3.60};
const MP_PIXELS={2:1920,4:2560,5:2592,8:3840,12:4000,16:4608};
const DORI_PPM={detection:25,observation:63,recognition:125,identification:250};
const DORI_LABELS={detection:'Detection',observation:'Observation',recognition:'Recognition',identification:'Identification'};
const DORI_COLORS={detection:'rgba(29,122,255,0.18)',observation:'rgba(34,211,160,0.16)',recognition:'rgba(251,146,60,0.20)',identification:'rgba(239,68,68,0.22)'};
const DORI_STROKES={detection:'#1d7aff',observation:'#22d3a0',recognition:'#fb923c',identification:'#ef4444'};
// Override table — populated when verified spreadsheet is uploaded
const DORI_OVERRIDE={};

function interpFov(mm){
  const keys=Object.keys(LENS_FOV).map(Number).sort((a,b)=>a-b);
  if(mm<=keys[0])return LENS_FOV[keys[0]];
  if(mm>=keys[keys.length-1])return LENS_FOV[keys[keys.length-1]];
  for(let i=0;i<keys.length-1;i++){
    if(mm>=keys[i]&&mm<=keys[i+1]){
      const t=(mm-keys[i])/(keys[i+1]-keys[i]);
      return Math.round(LENS_FOV[keys[i]]+(LENS_FOV[keys[i+1]]-LENS_FOV[keys[i]])*t);
    }
  }
  return 88;
}

function getSensorW(desc,mp){
  for(const[k,v] of Object.entries(SENSOR_W_MM)){
    if(desc.includes(k))return v;
  }
  if(mp<=2)return 4.80; if(mp<=4)return 5.37; return 5.37;
}

function calcDoriFt(hPx,focalMm,sensorW){
  const r={};
  for(const[level,ppm] of Object.entries(DORI_PPM)){
    r[level]=Math.round((hPx*focalMm)/(ppm*sensorW)*3.281);
  }
  return r;
}

function parseCameraSpecs(product){
  if(product.category!=='Cameras')return null;
  const desc=product.description.toLowerCase();
  const sku=product.sku;
  if(DORI_OVERRIDE[sku]){
    const o=DORI_OVERRIDE[sku];
    // Verified data can describe either a fixed lens or a motorized (wide/tele) lens —
    // previously this branch always returned isMotorized:false, which meant any verified
    // spec sheet for a zoom camera would silently lose its zoom behavior. Support both.
    if(o.isMotorized){
      return{fovDeg:o.wideFov||88,lensLabel:(o.wideMm||'?')+'-'+(o.teleMm||'?')+'mm',
             isMotorized:true,wideMm:o.wideMm,teleMm:o.teleMm,
             wideFov:o.wideFov,teleFov:o.teleFov,
             wideDori:o.wideDori||{},teleDori:o.teleDori||{},
             irFt:o.irFt||100,source:'verified'};
    }
    return{fovDeg:o.fovDeg||88,lensLabel:o.lensLabel||'',isMotorized:false,
           dori:o.dori||o,irFt:o.irFt||100,source:'verified'};
  }
  let mp=4;
  for(const m of[16,12,8,5,4,2]){if(desc.includes(m+'mp')||desc.includes(m+' mp')){mp=m;break;}}
  if(desc.includes('4k')&&mp===4)mp=8; if(desc.includes('8k'))mp=16;
  const hPx=MP_PIXELS[mp]||2560;
  const sensorW=getSensorW(desc,mp);
  const motorMatch=desc.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*mm/);
  const fixedMatch=!motorMatch&&desc.match(/(\d+\.?\d*)\s*mm/);
  let irFt=null;
  const ftM=desc.match(/(\d+)\s*ft/),mM=desc.match(/(\d+)\s*m(?:[^a-z]|$)/);
  if(ftM)irFt=parseInt(ftM[1]); else if(mM)irFt=Math.round(parseInt(mM[1])*3.281);
  if(!irFt){const def={2:65,4:100,5:100,8:130,12:165,16:200};irFt=def[mp]||100;}
  if(motorMatch){
    const wMm=parseFloat(motorMatch[1]),tMm=parseFloat(motorMatch[2]);
    return{fovDeg:interpFov(wMm),lensLabel:motorMatch[1]+'-'+motorMatch[2]+'mm',
           isMotorized:true,wideMm:wMm,teleMm:tMm,
           wideFov:interpFov(wMm),teleFov:interpFov(tMm),
           wideDori:calcDoriFt(hPx,wMm,sensorW),teleDori:calcDoriFt(hPx,tMm,sensorW),
           irFt,mp,hPx,sensorW,source:'calculated'};
  } else if(fixedMatch){
    const fMm=parseFloat(fixedMatch[1]);
    return{fovDeg:interpFov(fMm),lensLabel:fMm+'mm',isMotorized:false,
           dori:calcDoriFt(hPx,fMm,sensorW),irFt,mp,hPx,sensorW,source:'calculated'};
  }
  return{fovDeg:88,lensLabel:'',isMotorized:false,
         dori:{detection:100,observation:40,recognition:20,identification:10},
         irFt:100,source:'default'};
}

// Get effective specs for a placement (handles motorized zoom position)
function getEffectiveSpecs(pl){
  const specs=parseCameraSpecs(pl.product);
  if(!specs)return null;
  if(specs.isMotorized){
    const z=Math.max(0,Math.min(pl.zoomPos||0,1));
    const mm=specs.wideMm+(specs.teleMm-specs.wideMm)*z;
    // Route through the FOV/mm lookup table rather than blending wideFov/teleFov degrees
    // linearly — field of view is an arctangent function of focal length, not a straight
    // line, so a linear degree-blend visibly bows away from the true angle mid-zoom,
    // especially over a wide ratio like 2.8-12mm (4x+).
    const fovDeg=interpFov(mm);
    const dori={};
    for(const k of Object.keys(DORI_PPM)){
      dori[k]=Math.round((specs.wideDori[k]||0)+((specs.teleDori[k]||0)-(specs.wideDori[k]||0))*z);
    }
    return{...specs,fovDeg,dori,lensLabel:mm.toFixed(1)+'mm',currentMm:mm};
  }
  return specs;
}

// Given a target detection range (ft), solve for the zoomPos that produces it.
// Detection range is constructed as a linear interpolation between wideDori/teleDori
// (see getEffectiveSpecs above), so this inversion is exact — not an approximation —
// and stays exact whether wideDori/teleDori come from the calculated formula or from
// verified manufacturer data via DORI_OVERRIDE, since both flow through the same shape.
function zoomPosForRangeFt(specs,targetFt){
  if(!specs||!specs.isMotorized)return 0;
  const w=(specs.wideDori&&specs.wideDori.detection)||0;
  const t=(specs.teleDori&&specs.teleDori.detection)||0;
  if(t===w)return 0;
  return Math.max(0,Math.min((targetFt-w)/(t-w),1));
}

