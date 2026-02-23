import { useState, useEffect, useCallback, useRef } from "react";

// ============ HELPERS ============
function fmt(n){if(n<0)return`-${fmt(-n)}`;if(n>=1e6)return`${(n/1e6).toFixed(2)}M`;if(n>=1e4)return`${(n/1e3).toFixed(1)}K`;return`${Math.floor(n).toLocaleString()}`;}
function R(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function Rf(a,b){return Math.random()*(b-a)+a;}
function C(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function getSeason(m){return["Spring","Summer","Fall","Winter"][Math.floor(((m-1)%12)/3)];}
function getSI(m){return Math.floor(((m-1)%12)/3);}
function mileDist(a,b){const D=Math.PI/180;const d=Math.sin((b.lat-a.lat)*D/2)**2+Math.cos(a.lat*D)*Math.cos(b.lat*D)*Math.sin((b.lng-a.lng)*D/2)**2;return 3959*2*Math.atan2(Math.sqrt(d),Math.sqrt(1-d));}

// ============ GEOLOCATION ============
function findNearestCity(lat,lng){
  let best=null,bestDist=Infinity;
  for(const c of CITIES){const d=mileDist({lat,lng},{lat:c.lat,lng:c.lng});if(d<bestDist){bestDist=d;best=c;}}
  return{city:best,dist:Math.round(bestDist)};
}

// ============ MARKET SLOT SYSTEM ============
function getCitySlots(city){
  const total=city.mx;
  const playerReserved=Math.max(2,Math.ceil(total*.3));
  const aiMax=total-playerReserved;
  const perPlayerCap=Math.max(1,Math.floor(total*.3));
  return{total,playerReserved,aiMax,perPlayerCap};
}

function getCityOccupancy(g,cityId){
  const aiCount=g.aiShops.filter(s=>s.cityId===cityId).length;
  const playerCount=g.locations.filter(l=>l.cityId===cityId).length;
  const city=CITIES.find(c=>c.id===cityId);
  const slots=city?getCitySlots(city):{total:5,playerReserved:2,aiMax:3,perPlayerCap:1};
  const openForPlayers=Math.max(0,slots.total-aiCount-playerCount);
  const playerAtCap=playerCount>=slots.perPlayerCap;
  const marketFull=aiCount+playerCount>=slots.total;
  const saturation=Math.min(1,(aiCount+playerCount)/Math.max(1,slots.total));
  return{aiCount,playerCount,total:aiCount+playerCount,openForPlayers,playerAtCap,marketFull,saturation,slots};
}

function canOpenInCity(g,cityId){
  const occ=getCityOccupancy(g,cityId);
  if(occ.playerAtCap)return{ok:false,reason:`You already have ${occ.playerCount} shop${occ.playerCount>1?"s":""} here (max ${occ.slots.perPlayerCap} per player)`};
  if(occ.marketFull)return{ok:false,reason:`${CITIES.find(c=>c.id===cityId)?.name||"City"} market is full (${occ.total}/${occ.slots.total} shops)`};
  return{ok:true};
}
const SD={Spring:1.12,Summer:.82,Fall:1.25,Winter:1.08};
const SC={Spring:"#7bc47f",Summer:"#f0c040",Fall:"#d4823a",Winter:"#7db8d4"};
const TICK_SECONDS=15;

// ============ CITIES ============
const CITIES=[
  {id:"latrobe_pa",name:"Latrobe",state:"PA",pop:8,size:"small",lat:40.321,lng:-79.379,mx:3,dem:30,cost:1.0,win:1.3},
  {id:"greensburg_pa",name:"Greensburg",state:"PA",pop:15,size:"small",lat:40.301,lng:-79.538,mx:4,dem:45,cost:1.0,win:1.3},
  {id:"pittsburgh_pa",name:"Pittsburgh",state:"PA",pop:302,size:"metro",lat:40.440,lng:-79.995,mx:18,dem:250,cost:1.15,win:1.3},
  {id:"philly_pa",name:"Philadelphia",state:"PA",pop:1600,size:"metro",lat:39.952,lng:-75.163,mx:25,dem:400,cost:1.25,win:1.1},
  {id:"allentown_pa",name:"Allentown",state:"PA",pop:125,size:"city",lat:40.608,lng:-75.490,mx:10,dem:100,cost:1.05,win:1.2},
  {id:"erie_pa",name:"Erie",state:"PA",pop:95,size:"city",lat:42.129,lng:-80.085,mx:8,dem:80,cost:.95,win:1.5},
  {id:"scranton_pa",name:"Scranton",state:"PA",pop:76,size:"city",lat:41.408,lng:-75.662,mx:6,dem:65,cost:.92,win:1.3},
  {id:"harrisburg_pa",name:"Harrisburg",state:"PA",pop:50,size:"city",lat:40.263,lng:-76.882,mx:7,dem:70,cost:1.0,win:1.2},
  {id:"reading_pa",name:"Reading",state:"PA",pop:95,size:"city",lat:40.335,lng:-75.926,mx:6,dem:60,cost:.92,win:1.2},
  {id:"statecollege_pa",name:"State College",state:"PA",pop:42,size:"small",lat:40.793,lng:-77.860,mx:3,dem:25,cost:.95,win:1.3},
  {id:"johnstown_pa",name:"Johnstown",state:"PA",pop:18,size:"small",lat:40.326,lng:-78.922,mx:3,dem:22,cost:.82,win:1.4},
  {id:"uniontown_pa",name:"Uniontown",state:"PA",pop:10,size:"small",lat:39.899,lng:-79.716,mx:2,dem:15,cost:.8,win:1.3},
  {id:"columbus_oh",name:"Columbus",state:"OH",pop:905,size:"metro",lat:39.961,lng:-82.998,mx:18,dem:220,cost:.95,win:1.2},
  {id:"cleveland_oh",name:"Cleveland",state:"OH",pop:372,size:"metro",lat:41.499,lng:-81.694,mx:15,dem:180,cost:.92,win:1.4},
  {id:"youngstown_oh",name:"Youngstown",state:"OH",pop:60,size:"city",lat:41.099,lng:-80.649,mx:6,dem:55,cost:.85,win:1.3},
  {id:"cincinnati_oh",name:"Cincinnati",state:"OH",pop:309,size:"metro",lat:39.100,lng:-84.512,mx:14,dem:170,cost:.95,win:1.2},
  {id:"dayton_oh",name:"Dayton",state:"OH",pop:137,size:"city",lat:39.758,lng:-84.191,mx:8,dem:85,cost:.88,win:1.3},
  {id:"akron_oh",name:"Akron",state:"OH",pop:190,size:"city",lat:41.081,lng:-81.519,mx:9,dem:100,cost:.9,win:1.3},
  {id:"toledo_oh",name:"Toledo",state:"OH",pop:270,size:"metro",lat:41.653,lng:-83.537,mx:12,dem:130,cost:.88,win:1.4},
  {id:"canton_oh",name:"Canton",state:"OH",pop:70,size:"city",lat:40.798,lng:-81.378,mx:5,dem:45,cost:.85,win:1.3},
  {id:"charleston_wv",name:"Charleston",state:"WV",pop:47,size:"city",lat:38.349,lng:-81.632,mx:5,dem:40,cost:.82,win:1.0},
  {id:"morgantown_wv",name:"Morgantown",state:"WV",pop:31,size:"small",lat:39.629,lng:-79.955,mx:3,dem:28,cost:.85,win:1.1},
  {id:"huntington_wv",name:"Huntington",state:"WV",pop:46,size:"city",lat:38.419,lng:-82.445,mx:4,dem:32,cost:.78,win:1.0},
  {id:"nyc_ny",name:"New York City",state:"NY",pop:8300,size:"mega",lat:40.712,lng:-74.006,mx:35,dem:700,cost:1.55,win:1.0},
  {id:"buffalo_ny",name:"Buffalo",state:"NY",pop:255,size:"metro",lat:42.886,lng:-78.878,mx:12,dem:130,cost:1.0,win:1.6},
  {id:"albany_ny",name:"Albany",state:"NY",pop:99,size:"city",lat:42.652,lng:-73.756,mx:7,dem:75,cost:1.1,win:1.4},
  {id:"rochester_ny",name:"Rochester",state:"NY",pop:211,size:"city",lat:43.156,lng:-77.608,mx:9,dem:100,cost:1.0,win:1.5},
  {id:"syracuse_ny",name:"Syracuse",state:"NY",pop:148,size:"city",lat:43.048,lng:-76.147,mx:8,dem:80,cost:.95,win:1.5},
  {id:"yonkers_ny",name:"Yonkers",state:"NY",pop:200,size:"city",lat:40.931,lng:-73.898,mx:8,dem:90,cost:1.35,win:1.0},
  {id:"newark_nj",name:"Newark",state:"NJ",pop:311,size:"metro",lat:40.735,lng:-74.172,mx:12,dem:160,cost:1.25,win:1.0},
  {id:"trenton_nj",name:"Trenton",state:"NJ",pop:90,size:"city",lat:40.217,lng:-74.742,mx:6,dem:60,cost:1.1,win:1.0},
  {id:"edison_nj",name:"Edison",state:"NJ",pop:107,size:"city",lat:40.518,lng:-74.411,mx:6,dem:65,cost:1.2,win:1.0},
  {id:"miami_fl",name:"Miami",state:"FL",pop:440,size:"metro",lat:25.761,lng:-80.191,mx:20,dem:280,cost:1.15,win:.05},
  {id:"orlando_fl",name:"Orlando",state:"FL",pop:307,size:"metro",lat:28.538,lng:-81.379,mx:16,dem:210,cost:1.05,win:.05},
  {id:"tampa_fl",name:"Tampa",state:"FL",pop:385,size:"metro",lat:27.950,lng:-82.457,mx:16,dem:220,cost:1.05,win:.05},
  {id:"jax_fl",name:"Jacksonville",state:"FL",pop:949,size:"metro",lat:30.332,lng:-81.655,mx:18,dem:250,cost:.95,win:.05},
  {id:"ftlaud_fl",name:"Fort Lauderdale",state:"FL",pop:182,size:"city",lat:26.122,lng:-80.137,mx:10,dem:130,cost:1.1,win:.05},
  {id:"stpete_fl",name:"St. Petersburg",state:"FL",pop:258,size:"city",lat:27.773,lng:-82.640,mx:10,dem:120,cost:1.0,win:.05},
  {id:"tallahassee_fl",name:"Tallahassee",state:"FL",pop:196,size:"city",lat:30.438,lng:-84.280,mx:7,dem:65,cost:.88,win:.05},
  {id:"pensacola_fl",name:"Pensacola",state:"FL",pop:54,size:"city",lat:30.421,lng:-87.216,mx:6,dem:50,cost:.85,win:.1},
  {id:"houston_tx",name:"Houston",state:"TX",pop:2300,size:"mega",lat:29.760,lng:-95.369,mx:30,dem:600,cost:.95,win:.1},
  {id:"dallas_tx",name:"Dallas",state:"TX",pop:1340,size:"mega",lat:32.776,lng:-96.796,mx:28,dem:500,cost:1.0,win:.15},
  {id:"sanantonio_tx",name:"San Antonio",state:"TX",pop:1434,size:"mega",lat:29.424,lng:-98.493,mx:22,dem:380,cost:.9,win:.1},
  {id:"austin_tx",name:"Austin",state:"TX",pop:964,size:"metro",lat:30.267,lng:-97.743,mx:18,dem:280,cost:1.1,win:.1},
  {id:"elpaso_tx",name:"El Paso",state:"TX",pop:681,size:"metro",lat:31.761,lng:-106.485,mx:12,dem:140,cost:.85,win:.1},
  {id:"fortworth_tx",name:"Fort Worth",state:"TX",pop:918,size:"metro",lat:32.755,lng:-97.330,mx:16,dem:250,cost:.95,win:.15},
  {id:"corpus_tx",name:"Corpus Christi",state:"TX",pop:317,size:"metro",lat:27.800,lng:-97.396,mx:10,dem:100,cost:.85,win:.05},
  {id:"mcallen_tx",name:"McAllen",state:"TX",pop:143,size:"city",lat:26.203,lng:-98.230,mx:6,dem:55,cost:.78,win:.05},
  {id:"la_ca",name:"Los Angeles",state:"CA",pop:3900,size:"mega",lat:34.052,lng:-118.243,mx:35,dem:700,cost:1.5,win:.1},
  {id:"sf_ca",name:"San Francisco",state:"CA",pop:870,size:"metro",lat:37.774,lng:-122.419,mx:14,dem:200,cost:1.6,win:.15},
  {id:"sandiego_ca",name:"San Diego",state:"CA",pop:1386,size:"mega",lat:32.715,lng:-117.161,mx:20,dem:330,cost:1.3,win:.1},
  {id:"sacramento_ca",name:"Sacramento",state:"CA",pop:524,size:"metro",lat:38.581,lng:-121.494,mx:14,dem:180,cost:1.15,win:.1},
  {id:"fresno_ca",name:"Fresno",state:"CA",pop:542,size:"metro",lat:36.737,lng:-119.787,mx:12,dem:140,cost:.95,win:.1,agPct:.3},
  {id:"sanjose_ca",name:"San Jose",state:"CA",pop:1013,size:"metro",lat:37.338,lng:-121.886,mx:16,dem:250,cost:1.45,win:.1},
  {id:"riverside_ca",name:"Riverside",state:"CA",pop:314,size:"metro",lat:33.953,lng:-117.396,mx:12,dem:150,cost:1.1,win:.1},
  {id:"stockton_ca",name:"Stockton",state:"CA",pop:320,size:"metro",lat:37.957,lng:-121.290,mx:10,dem:110,cost:.95,win:.1,agPct:.25},
  {id:"longbeach_ca",name:"Long Beach",state:"CA",pop:466,size:"metro",lat:33.770,lng:-118.193,mx:12,dem:160,cost:1.3,win:.1},
  {id:"detroit_mi",name:"Detroit",state:"MI",pop:640,size:"metro",lat:42.331,lng:-83.045,mx:18,dem:220,cost:.9,win:1.5},
  {id:"grandrapids_mi",name:"Grand Rapids",state:"MI",pop:198,size:"city",lat:42.963,lng:-85.668,mx:9,dem:95,cost:.88,win:1.4},
  {id:"lansing_mi",name:"Lansing",state:"MI",pop:112,size:"city",lat:42.732,lng:-84.555,mx:7,dem:70,cost:.88,win:1.4},
  {id:"annarbor_mi",name:"Ann Arbor",state:"MI",pop:123,size:"city",lat:42.280,lng:-83.743,mx:6,dem:55,cost:1.0,win:1.4},
  {id:"flint_mi",name:"Flint",state:"MI",pop:97,size:"city",lat:43.012,lng:-83.687,mx:6,dem:50,cost:.78,win:1.5},
  {id:"atlanta_ga",name:"Atlanta",state:"GA",pop:498,size:"metro",lat:33.748,lng:-84.387,mx:20,dem:300,cost:1.0,win:.25},
  {id:"savannah_ga",name:"Savannah",state:"GA",pop:147,size:"city",lat:32.083,lng:-81.099,mx:7,dem:65,cost:.88,win:.2},
  {id:"augusta_ga",name:"Augusta",state:"GA",pop:202,size:"city",lat:33.470,lng:-81.974,mx:8,dem:75,cost:.85,win:.25},
  {id:"macon_ga",name:"Macon",state:"GA",pop:157,size:"city",lat:32.840,lng:-83.632,mx:6,dem:55,cost:.82,win:.2},
  {id:"chicago_il",name:"Chicago",state:"IL",pop:2700,size:"mega",lat:41.878,lng:-87.629,mx:30,dem:580,cost:1.15,win:1.35},
  {id:"springfield_il",name:"Springfield",state:"IL",pop:114,size:"city",lat:39.781,lng:-89.650,mx:6,dem:55,cost:.85,win:1.2},
  {id:"peoria_il",name:"Peoria",state:"IL",pop:113,size:"city",lat:40.693,lng:-89.588,mx:6,dem:50,cost:.85,win:1.2},
  {id:"joliet_il",name:"Joliet",state:"IL",pop:150,size:"city",lat:41.525,lng:-88.081,mx:7,dem:65,cost:.95,win:1.3},
  {id:"charlotte_nc",name:"Charlotte",state:"NC",pop:879,size:"metro",lat:35.227,lng:-80.843,mx:16,dem:220,cost:.92,win:.4},
  {id:"raleigh_nc",name:"Raleigh",state:"NC",pop:467,size:"metro",lat:35.779,lng:-78.638,mx:14,dem:180,cost:.95,win:.35},
  {id:"greensboro_nc",name:"Greensboro",state:"NC",pop:296,size:"metro",lat:36.072,lng:-79.791,mx:10,dem:110,cost:.88,win:.35},
  {id:"wilmington_nc",name:"Wilmington",state:"NC",pop:122,size:"city",lat:34.225,lng:-77.944,mx:6,dem:55,cost:.9,win:.3},
  {id:"boston_ma",name:"Boston",state:"MA",pop:675,size:"metro",lat:42.360,lng:-71.058,mx:18,dem:250,cost:1.3,win:1.4},
  {id:"worcester_ma",name:"Worcester",state:"MA",pop:206,size:"city",lat:42.262,lng:-71.802,mx:8,dem:85,cost:1.05,win:1.4},
  {id:"springfield_ma",name:"Springfield",state:"MA",pop:155,size:"city",lat:42.101,lng:-72.589,mx:7,dem:65,cost:.95,win:1.3},
  {id:"phoenix_az",name:"Phoenix",state:"AZ",pop:1608,size:"mega",lat:33.448,lng:-112.074,mx:25,dem:420,cost:.95,win:.05},
  {id:"tucson_az",name:"Tucson",state:"AZ",pop:542,size:"metro",lat:32.221,lng:-110.926,mx:12,dem:130,cost:.85,win:.05},
  {id:"mesa_az",name:"Mesa",state:"AZ",pop:504,size:"metro",lat:33.415,lng:-111.831,mx:10,dem:110,cost:.92,win:.05},
  {id:"flagstaff_az",name:"Flagstaff",state:"AZ",pop:73,size:"city",lat:35.198,lng:-111.651,mx:4,dem:30,cost:.9,win:.8},
  {id:"seattle_wa",name:"Seattle",state:"WA",pop:737,size:"metro",lat:47.606,lng:-122.332,mx:16,dem:220,cost:1.25,win:1.2},
  {id:"spokane_wa",name:"Spokane",state:"WA",pop:228,size:"city",lat:47.658,lng:-117.426,mx:9,dem:85,cost:.9,win:1.3},
  {id:"tacoma_wa",name:"Tacoma",state:"WA",pop:219,size:"city",lat:47.252,lng:-122.443,mx:8,dem:80,cost:1.1,win:1.2},
  {id:"denver_co",name:"Denver",state:"CO",pop:715,size:"metro",lat:39.739,lng:-104.990,mx:16,dem:220,cost:1.1,win:1.1},
  {id:"cosprings_co",name:"Colorado Springs",state:"CO",pop:478,size:"metro",lat:38.833,lng:-104.821,mx:12,dem:140,cost:.95,win:1.1},
  {id:"fortcollins_co",name:"Fort Collins",state:"CO",pop:169,size:"city",lat:40.585,lng:-105.084,mx:6,dem:55,cost:1.0,win:1.2},
  {id:"nashville_tn",name:"Nashville",state:"TN",pop:689,size:"metro",lat:36.162,lng:-86.781,mx:16,dem:220,cost:.95,win:.5},
  {id:"memphis_tn",name:"Memphis",state:"TN",pop:633,size:"metro",lat:35.149,lng:-90.048,mx:14,dem:180,cost:.85,win:.5},
  {id:"knoxville_tn",name:"Knoxville",state:"TN",pop:190,size:"city",lat:35.960,lng:-83.920,mx:8,dem:80,cost:.88,win:.5},
  {id:"chattanooga_tn",name:"Chattanooga",state:"TN",pop:182,size:"city",lat:35.045,lng:-85.309,mx:7,dem:70,cost:.85,win:.4},
  {id:"stlouis_mo",name:"St. Louis",state:"MO",pop:301,size:"metro",lat:38.627,lng:-90.199,mx:14,dem:180,cost:.9,win:1.1},
  {id:"kc_mo",name:"Kansas City",state:"MO",pop:508,size:"metro",lat:39.099,lng:-94.578,mx:14,dem:180,cost:.9,win:1.0},
  {id:"springfield_mo",name:"Springfield",state:"MO",pop:169,size:"city",lat:37.209,lng:-93.292,mx:7,dem:60,cost:.82,win:.9},
  {id:"indianapolis_in",name:"Indianapolis",state:"IN",pop:887,size:"metro",lat:39.768,lng:-86.158,mx:18,dem:220,cost:.9,win:1.2},
  {id:"fortwayne_in",name:"Fort Wayne",state:"IN",pop:263,size:"city",lat:41.079,lng:-85.139,mx:9,dem:85,cost:.85,win:1.2},
  {id:"southbend_in",name:"South Bend",state:"IN",pop:103,size:"city",lat:41.676,lng:-86.251,mx:5,dem:45,cost:.82,win:1.3},
  {id:"evansville_in",name:"Evansville",state:"IN",pop:117,size:"city",lat:37.971,lng:-87.571,mx:6,dem:50,cost:.82,win:1.0},
  {id:"minneapolis_mn",name:"Minneapolis",state:"MN",pop:429,size:"metro",lat:44.977,lng:-93.265,mx:16,dem:220,cost:1.05,win:1.5},
  {id:"duluth_mn",name:"Duluth",state:"MN",pop:90,size:"city",lat:46.786,lng:-92.100,mx:5,dem:35,cost:.88,win:1.6},
  {id:"rochester_mn",name:"Rochester",state:"MN",pop:121,size:"city",lat:44.021,lng:-92.469,mx:6,dem:50,cost:.95,win:1.5},
  {id:"milwaukee_wi",name:"Milwaukee",state:"WI",pop:577,size:"metro",lat:43.038,lng:-87.906,mx:14,dem:180,cost:.95,win:1.4},
  {id:"madison_wi",name:"Madison",state:"WI",pop:269,size:"city",lat:43.073,lng:-89.401,mx:9,dem:90,cost:1.0,win:1.4},
  {id:"greenbay_wi",name:"Green Bay",state:"WI",pop:107,size:"city",lat:44.519,lng:-88.019,mx:5,dem:45,cost:.88,win:1.5},
  {id:"richmond_va",name:"Richmond",state:"VA",pop:226,size:"city",lat:37.540,lng:-77.436,mx:10,dem:130,cost:.95,win:.6},
  {id:"norfolk_va",name:"Norfolk",state:"VA",pop:242,size:"city",lat:36.846,lng:-76.285,mx:10,dem:130,cost:.95,win:.5},
  {id:"virginiabeach_va",name:"Virginia Beach",state:"VA",pop:449,size:"metro",lat:36.852,lng:-75.978,mx:12,dem:150,cost:.95,win:.5},
  {id:"roanoke_va",name:"Roanoke",state:"VA",pop:100,size:"city",lat:37.270,lng:-79.941,mx:5,dem:45,cost:.85,win:.6},
  {id:"portland_or",name:"Portland",state:"OR",pop:652,size:"metro",lat:45.505,lng:-122.676,mx:16,dem:200,cost:1.15,win:1.2},
  {id:"eugene_or",name:"Eugene",state:"OR",pop:176,size:"city",lat:44.052,lng:-123.086,mx:7,dem:60,cost:.95,win:1.1},
  {id:"bend_or",name:"Bend",state:"OR",pop:99,size:"city",lat:44.058,lng:-121.315,mx:4,dem:30,cost:1.0,win:1.2},
  {id:"baltimore_md",name:"Baltimore",state:"MD",pop:585,size:"metro",lat:39.290,lng:-76.612,mx:14,dem:180,cost:1.05,win:.8},
  {id:"neworleans_la",name:"New Orleans",state:"LA",pop:390,size:"metro",lat:29.951,lng:-90.071,mx:14,dem:180,cost:.9,win:.1},
  {id:"batonrouge_la",name:"Baton Rouge",state:"LA",pop:227,size:"city",lat:30.451,lng:-91.187,mx:8,dem:80,cost:.85,win:.1},
  {id:"shreveport_la",name:"Shreveport",state:"LA",pop:188,size:"city",lat:32.525,lng:-93.750,mx:7,dem:60,cost:.82,win:.2},
  {id:"charleston_sc",name:"Charleston",state:"SC",pop:150,size:"city",lat:32.776,lng:-79.931,mx:8,dem:85,cost:.92,win:.3},
  {id:"columbia_sc",name:"Columbia",state:"SC",pop:137,size:"city",lat:34.000,lng:-81.034,mx:7,dem:65,cost:.88,win:.3},
  {id:"greenville_sc",name:"Greenville",state:"SC",pop:70,size:"city",lat:34.852,lng:-82.394,mx:6,dem:55,cost:.88,win:.3},
  {id:"birmingham_al",name:"Birmingham",state:"AL",pop:200,size:"city",lat:33.520,lng:-86.802,mx:10,dem:110,cost:.85,win:.3},
  {id:"montgomery_al",name:"Montgomery",state:"AL",pop:200,size:"city",lat:32.361,lng:-86.278,mx:7,dem:60,cost:.82,win:.25},
  {id:"huntsville_al",name:"Huntsville",state:"AL",pop:215,size:"city",lat:34.730,lng:-86.586,mx:8,dem:80,cost:.88,win:.3},
  {id:"mobile_al",name:"Mobile",state:"AL",pop:187,size:"city",lat:30.695,lng:-88.039,mx:7,dem:60,cost:.82,win:.15},
  {id:"vegas_nv",name:"Las Vegas",state:"NV",pop:641,size:"metro",lat:36.169,lng:-115.140,mx:16,dem:220,cost:1.0,win:.05},
  {id:"reno_nv",name:"Reno",state:"NV",pop:264,size:"city",lat:39.529,lng:-119.813,mx:8,dem:80,cost:.95,win:.8},
  {id:"okc_ok",name:"Oklahoma City",state:"OK",pop:681,size:"metro",lat:35.467,lng:-97.516,mx:14,dem:180,cost:.85,win:.6},
  {id:"tulsa_ok",name:"Tulsa",state:"OK",pop:413,size:"metro",lat:36.153,lng:-95.992,mx:12,dem:140,cost:.82,win:.6},
  {id:"hartford_ct",name:"Hartford",state:"CT",pop:121,size:"city",lat:41.763,lng:-72.685,mx:8,dem:80,cost:1.1,win:1.3},
  {id:"newhaven_ct",name:"New Haven",state:"CT",pop:134,size:"city",lat:41.308,lng:-72.924,mx:6,dem:55,cost:1.1,win:1.2},
  {id:"stamford_ct",name:"Stamford",state:"CT",pop:135,size:"city",lat:41.053,lng:-73.538,mx:6,dem:55,cost:1.3,win:1.1},
  {id:"slc_ut",name:"Salt Lake City",state:"UT",pop:199,size:"city",lat:40.760,lng:-111.891,mx:12,dem:140,cost:1.0,win:1.0},
  {id:"provo_ut",name:"Provo",state:"UT",pop:115,size:"city",lat:40.233,lng:-111.658,mx:6,dem:50,cost:.95,win:1.0},
  {id:"louisville_ky",name:"Louisville",state:"KY",pop:633,size:"metro",lat:38.252,lng:-85.758,mx:14,dem:180,cost:.88,win:.8},
  {id:"lexington_ky",name:"Lexington",state:"KY",pop:322,size:"metro",lat:38.040,lng:-84.503,mx:10,dem:110,cost:.9,win:.8},
  {id:"wichita_ks",name:"Wichita",state:"KS",pop:397,size:"metro",lat:37.687,lng:-97.330,mx:12,dem:120,cost:.82,win:.8},
  {id:"topeka_ks",name:"Topeka",state:"KS",pop:127,size:"city",lat:39.048,lng:-95.677,mx:5,dem:45,cost:.8,win:.9},
  {id:"desmoines_ia",name:"Des Moines",state:"IA",pop:214,size:"city",lat:41.586,lng:-93.625,mx:10,dem:90,cost:.88,win:1.2,agPct:.25},
  {id:"cedarrapids_ia",name:"Cedar Rapids",state:"IA",pop:137,size:"city",lat:41.977,lng:-91.665,mx:6,dem:50,cost:.85,win:1.2,agPct:.3},
  {id:"omaha_ne",name:"Omaha",state:"NE",pop:486,size:"metro",lat:41.256,lng:-95.934,mx:12,dem:130,cost:.88,win:1.1,agPct:.2},
  {id:"lincoln_ne",name:"Lincoln",state:"NE",pop:291,size:"city",lat:40.813,lng:-96.702,mx:8,dem:70,cost:.85,win:1.1,agPct:.3},
  {id:"albuquerque_nm",name:"Albuquerque",state:"NM",pop:564,size:"metro",lat:35.084,lng:-106.650,mx:12,dem:130,cost:.85,win:.3},
  {id:"santafe_nm",name:"Santa Fe",state:"NM",pop:88,size:"city",lat:35.686,lng:-105.937,mx:4,dem:30,cost:1.0,win:.4},
  {id:"jackson_ms",name:"Jackson",state:"MS",pop:153,size:"city",lat:32.298,lng:-90.184,mx:7,dem:60,cost:.78,win:.2},
  {id:"biloxi_ms",name:"Biloxi",state:"MS",pop:46,size:"small",lat:30.396,lng:-88.885,mx:3,dem:25,cost:.78,win:.1},
  {id:"littlerock_ar",name:"Little Rock",state:"AR",pop:202,size:"city",lat:34.746,lng:-92.289,mx:8,dem:75,cost:.82,win:.5},
  {id:"fayetteville_ar",name:"Fayetteville",state:"AR",pop:93,size:"city",lat:36.062,lng:-94.157,mx:5,dem:40,cost:.85,win:.5,agPct:.25},
  {id:"honolulu_hi",name:"Honolulu",state:"HI",pop:345,size:"metro",lat:21.306,lng:-157.858,mx:10,dem:100,cost:1.5,win:.0},
  {id:"anchorage_ak",name:"Anchorage",state:"AK",pop:291,size:"city",lat:61.218,lng:-149.900,mx:8,dem:70,cost:1.3,win:1.8},
  {id:"manchester_nh",name:"Manchester",state:"NH",pop:115,size:"city",lat:42.990,lng:-71.463,mx:5,dem:45,cost:1.0,win:1.4},
  {id:"portland_me",name:"Portland",state:"ME",pop:68,size:"city",lat:43.661,lng:-70.255,mx:5,dem:40,cost:1.0,win:1.5},
  {id:"burlington_vt",name:"Burlington",state:"VT",pop:45,size:"small",lat:44.475,lng:-73.212,mx:3,dem:22,cost:1.05,win:1.6},
  {id:"providence_ri",name:"Providence",state:"RI",pop:190,size:"city",lat:41.824,lng:-71.412,mx:7,dem:65,cost:1.1,win:1.3},
  {id:"wilmington_de",name:"Wilmington",state:"DE",pop:70,size:"city",lat:39.745,lng:-75.546,mx:5,dem:45,cost:1.05,win:1.0},
  {id:"dc_dc",name:"Washington D.C.",state:"DC",pop:689,size:"metro",lat:38.907,lng:-77.036,mx:14,dem:180,cost:1.35,win:.7},
  {id:"fargo_nd",name:"Fargo",state:"ND",pop:125,size:"city",lat:46.877,lng:-96.789,mx:5,dem:45,cost:.82,win:1.5,agPct:.5},
  {id:"bismarck_nd",name:"Bismarck",state:"ND",pop:73,size:"city",lat:46.808,lng:-100.783,mx:3,dem:22,cost:.82,win:1.5,agPct:.5},
  {id:"siouxfalls_sd",name:"Sioux Falls",state:"SD",pop:192,size:"city",lat:43.547,lng:-96.728,mx:7,dem:60,cost:.82,win:1.3,agPct:.45},
  {id:"rapidcity_sd",name:"Rapid City",state:"SD",pop:77,size:"city",lat:44.080,lng:-103.230,mx:3,dem:25,cost:.82,win:1.2,agPct:.35},
  {id:"billings_mt",name:"Billings",state:"MT",pop:117,size:"city",lat:45.783,lng:-108.510,mx:5,dem:40,cost:.85,win:1.3,agPct:.4},
  {id:"missoula_mt",name:"Missoula",state:"MT",pop:74,size:"city",lat:46.871,lng:-113.993,mx:3,dem:22,cost:.88,win:1.3,agPct:.3},
  {id:"boise_id",name:"Boise",state:"ID",pop:228,size:"city",lat:43.615,lng:-116.201,mx:8,dem:70,cost:.9,win:1.1,agPct:.3},
  {id:"cheyenne_wy",name:"Cheyenne",state:"WY",pop:64,size:"city",lat:41.139,lng:-104.820,mx:3,dem:20,cost:.85,win:1.2,agPct:.4},
  {id:"indiana_pa",name:"Indiana",state:"PA",pop:13,size:"rural",lat:40.621,lng:-79.152,mx:2,dem:18,cost:.85,win:1.3,agPct:.45},
  {id:"somerset_pa",name:"Somerset",state:"PA",pop:6,size:"rural",lat:40.008,lng:-79.077,mx:2,dem:12,cost:.8,win:1.4,agPct:.6},
  {id:"lancaster_pa",name:"Lancaster",state:"PA",pop:60,size:"city",lat:40.037,lng:-76.305,mx:6,dem:70,cost:.95,win:1.1,agPct:.35},
  {id:"wooster_oh",name:"Wooster",state:"OH",pop:27,size:"rural",lat:40.805,lng:-81.935,mx:2,dem:20,cost:.82,win:1.2,agPct:.55},
  {id:"mansfield_oh",name:"Mansfield",state:"OH",pop:46,size:"small",lat:40.758,lng:-82.515,mx:3,dem:30,cost:.85,win:1.2,agPct:.3},
  {id:"elkins_wv",name:"Elkins",state:"WV",pop:7,size:"rural",lat:38.926,lng:-79.846,mx:2,dem:10,cost:.75,win:1.0,agPct:.65},
  {id:"tifton_ga",name:"Tifton",state:"GA",pop:17,size:"rural",lat:31.450,lng:-83.508,mx:2,dem:15,cost:.8,win:.15,agPct:.7},
  {id:"lubbock_tx",name:"Lubbock",state:"TX",pop:260,size:"city",lat:33.577,lng:-101.855,mx:8,dem:75,cost:.85,win:.1,agPct:.4},
  {id:"bakersfield_ca",name:"Bakersfield",state:"CA",pop:403,size:"metro",lat:35.373,lng:-119.018,mx:12,dem:130,cost:1.1,win:.1,agPct:.35},
  {id:"rockford_il",name:"Rockford",state:"IL",pop:148,size:"city",lat:42.271,lng:-89.093,mx:6,dem:55,cost:.9,win:1.3,agPct:.3},
  {id:"traverse_mi",name:"Traverse City",state:"MI",pop:15,size:"rural",lat:44.763,lng:-85.620,mx:2,dem:14,cost:.9,win:1.5,agPct:.4},
  {id:"kinston_nc",name:"Kinston",state:"NC",pop:20,size:"rural",lat:35.262,lng:-77.581,mx:2,dem:16,cost:.82,win:.3,agPct:.5},
  {id:"amarillo_tx",name:"Amarillo",state:"TX",pop:200,size:"city",lat:35.221,lng:-101.831,mx:6,dem:55,cost:.8,win:.2,agPct:.45},
  {id:"midland_tx",name:"Midland",state:"TX",pop:146,size:"city",lat:31.997,lng:-102.077,mx:5,dem:45,cost:.88,win:.1,agPct:.3},
  {id:"abilene_tx",name:"Abilene",state:"TX",pop:125,size:"city",lat:32.448,lng:-99.733,mx:5,dem:40,cost:.8,win:.15,agPct:.35},
  {id:"yakima_wa",name:"Yakima",state:"WA",pop:96,size:"city",lat:46.600,lng:-120.505,mx:4,dem:30,cost:.85,win:1.2,agPct:.5},
  {id:"greatfalls_mt",name:"Great Falls",state:"MT",pop:59,size:"small",lat:47.506,lng:-111.300,mx:2,dem:15,cost:.82,win:1.4,agPct:.5},
  {id:"pueblo_co",name:"Pueblo",state:"CO",pop:112,size:"city",lat:38.254,lng:-104.609,mx:4,dem:30,cost:.82,win:1.0,agPct:.3},
  {id:"toppenish_wa",name:"Toppenish",state:"WA",pop:9,size:"rural",lat:46.377,lng:-120.310,mx:2,dem:10,cost:.78,win:1.2,agPct:.7},
  {id:"valdosta_ga",name:"Valdosta",state:"GA",pop:56,size:"small",lat:30.832,lng:-83.278,mx:3,dem:22,cost:.78,win:.15,agPct:.5},
  {id:"jonesboro_ar",name:"Jonesboro",state:"AR",pop:78,size:"city",lat:35.842,lng:-90.704,mx:3,dem:25,cost:.78,win:.5,agPct:.45},
  {id:"garden_ks",name:"Garden City",state:"KS",pop:28,size:"rural",lat:37.971,lng:-100.872,mx:2,dem:12,cost:.78,win:.7,agPct:.65},
  {id:"scottsbluff_ne",name:"Scottsbluff",state:"NE",pop:15,size:"rural",lat:41.866,lng:-103.667,mx:2,dem:10,cost:.78,win:1.1,agPct:.6},
  {id:"bangor_me",name:"Bangor",state:"ME",pop:32,size:"small",lat:44.801,lng:-68.777,mx:3,dem:22,cost:.88,win:1.6},
  {id:"concord_nh",name:"Concord",state:"NH",pop:43,size:"small",lat:43.208,lng:-71.537,mx:3,dem:25,cost:.95,win:1.4},
  {id:"dover_de",name:"Dover",state:"DE",pop:39,size:"small",lat:39.157,lng:-75.524,mx:3,dem:22,cost:.9,win:1.0},
  {id:"gulfport_ms",name:"Gulfport",state:"MS",pop:72,size:"city",lat:30.367,lng:-89.092,mx:4,dem:30,cost:.82,win:.2},
  {id:"idahofalls_id",name:"Idaho Falls",state:"ID",pop:64,size:"city",lat:43.492,lng:-112.040,mx:3,dem:22,cost:.85,win:1.3,agPct:.4},
  {id:"fairbanks_ak",name:"Fairbanks",state:"AK",pop:32,size:"small",lat:64.837,lng:-147.716,mx:2,dem:15,cost:1.4,win:2.0},
  {id:"lascruce_nm",name:"Las Cruces",state:"NM",pop:111,size:"city",lat:32.349,lng:-106.760,mx:5,dem:35,cost:.82,win:.15},
];

// ============ AI PERSONALITIES ============
const PERS=[
  {t:"used_dealer",nm:"Used Tire Dealer",ic:"🔧",desc:"Volume used, low prices",pm:.8,uf:true,rb:15,wb:40000},
  {t:"mom_pop",nm:"Mom & Pop",ic:"👨‍👩‍👦",desc:"Loyal base, personal service",pm:1.0,uf:false,rb:35,wb:80000},
  {t:"discount",nm:"Discounter",ic:"💸",desc:"Lowest prices, thin margins",pm:.85,uf:false,rb:25,wb:120000},
  {t:"premium",nm:"Premium Service",ic:"⭐",desc:"High-end brands, top dollar",pm:1.2,uf:false,rb:50,wb:200000},
  {t:"chain",nm:"Regional Chain",ic:"🏢",desc:"Brand recognition, competitive",pm:.95,uf:false,rb:40,wb:300000},
  {t:"fleet",nm:"Fleet Specialist",ic:"🚛",desc:"B2B, commercial focus",pm:1.05,uf:false,rb:30,wb:180000},
  {t:"old_school",nm:"Old School Garage",ic:"🏚️",desc:"30 years, declining but loyal",pm:1.1,uf:true,rb:45,wb:60000},
  {t:"ag_dealer",nm:"Farm & AG Dealer",ic:"🚜",desc:"Tractors, implements, ATVs",pm:1.05,uf:false,rb:30,wb:90000,ag:true},
];

const SH_NAMES=["Quick","Fast","Pro","All","Best","Top","Value","Elite","Prime","Classic","Metro","Town","County","Express","Budget"];
const SH_SUFFIX=["Tire","Tires","Wheel","Auto","Tire Co","Tire Shop","Tire Plus","Tire Center","Tire Express","Tire Depot","Tire Barn","Wheels"];

// ============ GAME CONSTANTS ============
const TIRES={
  used_junk:{n:"Used (Junk)",bMin:1,bMax:5,def:15,lo:5,hi:25,used:1,disp:1},
  used_poor:{n:"Used (Poor)",bMin:5,bMax:12,def:28,lo:12,hi:40,used:1},
  used_good:{n:"Used (Good)",bMin:10,bMax:22,def:45,lo:22,hi:65,used:1},
  used_premium:{n:"Used (Premium)",bMin:18,bMax:35,def:65,lo:35,hi:95,used:1},
  allSeason:{n:"All-Season",bMin:45,bMax:72,def:105,lo:75,hi:150},
  performance:{n:"Performance",bMin:75,bMax:115,def:155,lo:115,hi:220},
  winter:{n:"Winter/Snow",bMin:65,bMax:100,def:140,lo:100,hi:195,seas:1},
  lightTruck:{n:"Light Truck",bMin:85,bMax:135,def:175,lo:135,hi:250},
  commercial:{n:"Commercial",bMin:110,bMax:170,def:230,lo:170,hi:320},
  atv:{n:"ATV/UTV",bMin:35,bMax:60,def:90,lo:60,hi:130,ag:1},
  implement:{n:"Farm Implement",bMin:50,bMax:90,def:125,lo:85,hi:180,ag:1},
  tractor:{n:"Tractor/AG",bMin:200,bMax:400,def:550,lo:380,hi:800,ag:1},
};

const STORAGE={van:{n:"Your Van",cap:20,c:0,mo:0,ic:"🚐",staff:0},garage:{n:"Rented Garage",cap:80,c:1200,mo:350,ic:"🏠",staff:0},lot:{n:"Storage Lot",cap:300,c:5000,mo:800,ic:"📦",staff:0},smallWH:{n:"Small Warehouse",cap:2000,c:40000,mo:4500,ic:"🏭",staff:1},warehouse:{n:"Warehouse",cap:6000,c:120000,mo:8000,ic:"🏗️",staff:3},distCenter:{n:"Dist. Center",cap:18000,c:350000,mo:15000,ic:"🏢",staff:8}};

const WH_ROLES={
  loader:{n:"Warehouse Loader",ic:"📦",pay:2800,desc:"Moves tires, loads trucks"},
  forklift:{n:"Forklift Operator",ic:"🏗️",pay:3400,desc:"Heavy lifting, pallet mgmt"},
  receiving:{n:"Receiving Clerk",ic:"📋",pay:3200,desc:"Checks inbound shipments, PO matching"},
  shipping:{n:"Shipping Clerk",ic:"🚚",pay:3200,desc:"Outbound orders, BOLs, tracking"},
  whMgr:{n:"Warehouse Manager",ic:"👷",pay:5800,desc:"Runs the floor, manages staff"},
  inventory:{n:"Inventory Specialist",ic:"🔢",pay:3600,desc:"Cycle counts, shrinkage control"},
  dockSup:{n:"Dock Supervisor",ic:"🏭",pay:4500,desc:"Oversees receiving/shipping docks"},
  logistics:{n:"Logistics Coordinator",ic:"🌐",pay:5200,desc:"Routes shipments, carrier mgmt"},
};

const SOURCES={scrapYard:{n:"Scrap Yard",c:30,min:1,max:6,ic:"🔧",d:"Mostly junk"},fleaMarket:{n:"Flea Market",c:50,min:2,max:8,ic:"🏪",d:"Mixed quality"},garageCleanout:{n:"Cleanouts",c:15,min:0,max:4,ic:"🏡",d:"Hit or miss"},auctionLot:{n:"Auction",c:250,min:8,max:25,ic:"🔨",d:"Bulk mixed",rr:25},estateFind:{n:"Estate Sale",c:100,min:3,max:10,ic:"🏚️",d:"Gems possible",rr:15}};

const SUPPLIERS=[{n:"TireMax Express",min:20,disc:0,c:1000,ic:"📦",rr:0},{n:"NorthPoint Tire Group",min:50,disc:.04,c:3000,ic:"🏭",rr:15},{n:"TireBridge National",min:100,disc:.07,c:8000,ic:"🌐",rr:30},{n:"Pacific Rim Imports",min:250,disc:.13,c:20000,ic:"🚢",rr:45},{n:"Summit Tire Direct",min:500,disc:.09,c:75000,ic:"⭐",rr:60},{n:"AgriTrax Supply",min:15,disc:.05,c:2500,ic:"🚜",rr:10,ag:true,desc:"ATV, implement & tractor tires"},{n:"Heartland AG Wholesale",min:40,disc:.12,c:12000,ic:"🌾",rr:30,ag:true,desc:"Volume ag, best tractor pricing"}];

const MANUFACTURERS=[
  {id:"shandong",n:"Huadong Rubber Group",ic:"🇨🇳",region:"China",tires:["allSeason","lightTruck","commercial"],disc:.28,freight:4500,containerQty:500,leadWeeks:8,partnerCost:50000,quality:.85,desc:"Cheapest per tire. 8-week ocean freight. Huge containers."},
  {id:"thai_union",n:"SiamTrak Industries",ic:"🇹🇭",region:"Thailand",tires:["allSeason","performance","lightTruck"],disc:.24,freight:3800,containerQty:400,leadWeeks:7,partnerCost:40000,quality:.9,desc:"Solid quality. 7-week lead. Good performance line."},
  {id:"apex_domestic",n:"Patriot Tire USA",ic:"🇺🇸",region:"Domestic",tires:["allSeason","performance","winter","lightTruck"],disc:.14,freight:1200,containerQty:200,leadWeeks:2,partnerCost:80000,quality:.95,desc:"2-week domestic freight. Premium quality. Higher cost."},
  {id:"euro_premium",n:"Rheingold Reifen AG",ic:"🇩🇪",region:"Germany",tires:["performance","winter","allSeason"],disc:.18,freight:3200,containerQty:300,leadWeeks:5,partnerCost:120000,quality:1.0,desc:"Top-tier European brand. 5-week freight. Strong winter line."},
  {id:"hansung",n:"HanWoo Tire Co.",ic:"🇰🇷",region:"South Korea",tires:["allSeason","performance","lightTruck","commercial"],disc:.22,freight:3500,containerQty:350,leadWeeks:6,partnerCost:60000,quality:.92,desc:"Great value. Wide selection. 6-week ocean freight."},
  {id:"ironwheel_ag",n:"IronTrak Industries",ic:"🚜",region:"Domestic",tires:["tractor","implement","atv"],disc:.16,freight:2200,containerQty:80,leadWeeks:3,partnerCost:90000,quality:.95,desc:"THE ag tire manufacturer. 3-week domestic. Smaller loads."},
  {id:"bharat_ag",n:"Bharat Krishi Rubber",ic:"🇮🇳",region:"India",tires:["tractor","implement","atv"],disc:.3,freight:4000,containerQty:120,leadWeeks:9,partnerCost:45000,quality:.82,desc:"Cheapest ag tires on earth. 9-week freight. Volume play."},
];

const LOANS=[{n:"Micro",amt:5000,r:.14,t:6,rr:0},{n:"Small Biz",amt:25000,r:.095,t:12,rr:10},{n:"SBA",amt:75000,r:.07,t:24,rr:25},{n:"Equipment",amt:150000,r:.065,t:36,rr:35},{n:"Commercial",amt:350000,r:.055,t:48,rr:50},{n:"Expansion",amt:750000,r:.05,t:60,rr:65}];
const SHOP_BASE=137500;
const SHOP_MO=7000;
const PAY={techs:3800,sales:3000,managers:5200,drivers:2800};

const EVENTS=[
  {t:"🌨️ Storm! Winter surge!",fn:g=>({...g,_wB:3}),ch:.04,s:3},
  {t:"🕳️ Pothole season!",fn:g=>({...g,_tB:1.4}),ch:.06,s:0},
  {t:"📦 Shipping +15%",fn:g=>({...g,_cM:1.15}),ch:.05},
  {t:"⭐ Good review!",fn:g=>({...g,_tB:1.2}),ch:.03},
  {t:"🔧 Tech quit!",fn:g=>g.staff.techs>0?{...g,staff:{...g.staff,techs:g.staff.techs-1}}:g,ch:.04},
  {t:"💰 Fleet inquiry!",fn:g=>({...g,_fO:{name:["CityTransit","DeliveryCo","SchoolBus","TaxiFleet"][R(0,3)],qty:20+R(0,40),pr:55+R(0,35)}}),ch:.04},
  {t:"⚠️ Recall!",fn:g=>({...g,cash:g.cash-Math.min(g.cash*.04,3000),reputation:Math.max(0,g.reputation-1)}),ch:.02},
  {t:"📉 Recession — used up",fn:g=>({...g,_uB:1.6}),ch:.03},
  {t:"🎉 Vendor rebate 12%!",fn:g=>({...g,_vR:.12}),ch:.04},
  {t:"🔥 Competitor closed!",fn:g=>({...g,_tB:1.5,reputation:C(g.reputation+1,0,100)}),ch:.015},
  {t:"💸 Chargeback $450",fn:g=>({...g,cash:g.cash-450}),ch:.05},
  {t:"📱 Bad review",fn:g=>({...g,reputation:Math.max(0,g.reputation-1.5),_tB:.85}),ch:.04},
  {t:"🏥 Workers comp",fn:g=>({...g,cash:g.cash-2500}),ch:.025},
  {t:"🚔 Junk tire fine!",fn:g=>{const j=g.inventory.used_junk||0;return j>10?{...g,cash:g.cash-j*5,reputation:Math.max(0,g.reputation-2)}:g;},ch:.03},
];

const GOV_TYPES=[
  {type:"school",name:"School District Buses",ic:"🚌",tires:["allSeason","lightTruck"],qtyMin:40,qtyMax:120,dur:6,minRep:20,minLocs:1},
  {type:"police",name:"Police/Fire Fleet",ic:"🚔",tires:["allSeason","performance"],qtyMin:30,qtyMax:80,dur:12,minRep:30,minLocs:1},
  {type:"municipal",name:"Municipal Vehicles",ic:"🏛️",tires:["allSeason","lightTruck","commercial"],qtyMin:60,qtyMax:200,dur:12,minRep:25,minLocs:2},
  {type:"dot",name:"State DOT Trucks",ic:"🚧",tires:["commercial","lightTruck","winter"],qtyMin:100,qtyMax:400,dur:12,minRep:40,minLocs:3},
  {type:"military",name:"Military Base Vehicles",ic:"🎖️",tires:["allSeason","lightTruck","commercial"],qtyMin:150,qtyMax:500,dur:24,minRep:55,minLocs:3},
  {type:"county_ag",name:"County AG Equipment",ic:"🌾",tires:["tractor","implement","atv"],qtyMin:20,qtyMax:80,dur:12,minRep:15,minLocs:1},
  {type:"parks",name:"Parks & Rec Fleet",ic:"🌲",tires:["atv","lightTruck"],qtyMin:15,qtyMax:50,dur:6,minRep:15,minLocs:1},
];

const CORP_PAY={hr:4800,accountant:5500,ops:6200,regional:7500};
const CORP_THRESHOLDS={hr:3,accountant:5,ops:8,regional:4};

const DIST_UNLOCK_COST=500000;
const DIST_MONTHLY=12000;
const DIST_MIN_REP=50;
const DIST_MIN_LOCS=5;
const DIST_MIN_STORAGE="distCenter";

const TPO_BRANDS=[
  {id:"megamart",n:"ValueMart",ic:"🏬",desc:"Big box retailer, steady volume",outboundFee:8,storageFeePerTire:.75,minStorage:2000,minRep:35,weeklyShipVol:[40,120],tiresStored:[500,2000],reqStaff:{shipping:1,logistics:1}},
  {id:"eztire",n:"ClickTire Online",ic:"🌐",desc:"Online marketplace, variable volume",outboundFee:10,storageFeePerTire:1.0,minStorage:1000,minRep:25,weeklyShipVol:[20,80],tiresStored:[200,800],reqStaff:{shipping:1}},
  {id:"primetire",n:"RapidShip Tire",ic:"📦",desc:"Major online retailer, high volume",outboundFee:6,storageFeePerTire:.50,minStorage:4000,minRep:45,weeklyShipVol:[80,250],tiresStored:[1500,5000],reqStaff:{shipping:2,logistics:1,dockSup:1}},
  {id:"simplewheels",n:"EasyRoll Direct",ic:"🔄",desc:"Online retailer, returns program included",outboundFee:9,storageFeePerTire:.85,minStorage:1500,minRep:30,weeklyShipVol:[30,100],tiresStored:[300,1200],reqStaff:{shipping:1,receiving:1}},
];

const RETURN_DEAL_TEMPLATES=[
  {brand:"EasyRoll Direct",tireTypes:["allSeason","performance","lightTruck"],qtyRange:[5000,15000],costRange:[20,45],mapRestricted:.4,desc:"New tire returns. Mixed SKUs. MAP on ~40% means wholesale-only for some."},
  {brand:"ValueMart",tireTypes:["allSeason","lightTruck"],qtyRange:[3000,8000],costRange:[30,50],mapRestricted:.2,desc:"Overstock returns. Mostly all-season. Good retail candidates."},
  {brand:"RapidShip Tire",tireTypes:["allSeason","performance","winter","lightTruck","commercial"],qtyRange:[8000,25000],costRange:[18,40],mapRestricted:.6,desc:"Massive volume. Heavy MAP restrictions. Wholesale division fuel."},
];

const MAP_FLOOR={allSeason:.82,performance:.85,winter:.80,lightTruck:.80,commercial:.78};
const VOL_TIERS=[
  {min:0,disc:0,label:"Standard"},
  {min:200,disc:.03,label:"Bronze (3% off)"},
  {min:500,disc:.06,label:"Silver (6% off)"},
  {min:1500,disc:.10,label:"Gold (10% off)"},
  {min:5000,disc:.15,label:"Platinum (15% off)"},
  {min:15000,disc:.20,label:"Diamond (20% off)"},
];

function getVolTier(monthlyVol){let best=VOL_TIERS[0];for(const t of VOL_TIERS){if(monthlyVol>=t.min)best=t;}return best;}

const WS_BASE_MARGIN={min:.03,max:.08};
const WS_VOL_BONUS=[
  {minVol:0,bonus:0,label:"No Vol Bonus"},
  {minVol:200,bonus:.02,label:"+2% (Silver Vol)"},
  {minVol:500,bonus:.04,label:"+4% (Gold Vol)"},
  {minVol:1000,bonus:.06,label:"+6% (Platinum Vol)"},
  {minVol:2500,bonus:.08,label:"+8% (Diamond Vol)"},
];
const WS_RELATIONSHIP_BONUS=.005;
const WS_DELIVERY_COST={min:4,max:8};
const WS_STORAGE_COST=.50;
const WS_MIN_REP=30;
const WS_MIN_STORAGE=2000;

const ECOM_UNLOCK_COST=150000;
const ECOM_MIN_REP=35;
const ECOM_MIN_STORAGE=2000;
const ECOM_STAFF={
  webDev:{title:"Web Developer",salary:7500,desc:"Site UX, checkout flow, speed optimization",convBoost:.04},
  seniorDev:{title:"Senior Developer",salary:11000,desc:"Architecture, API integrations, mobile",convBoost:.06,req:{webDev:true}},
  seoSpecialist:{title:"SEO/SEM Specialist",salary:6500,desc:"Google rankings, ad campaigns, keywords",trafficBoost:.12},
  contentWriter:{title:"Content Writer",salary:4500,desc:"Buying guides, reviews, fitment articles",convBoost:.05},
  photographer:{title:"Product Photographer",salary:4000,desc:"Tire photos, 360 views, lifestyle images",convBoost:.03},
  csRep:{title:"Customer Service Rep",salary:3500,desc:"Phone/chat/email — handle orders & returns",maxOrders:200},
  csManager:{title:"CS Manager",salary:5500,desc:"Manages support team, escalations, quality",req:{csRep:true},convBoost:.02},
  dataAnalyst:{title:"Data Analyst",salary:6500,desc:"Conversion tracking, A/B testing, pricing",convBoost:.03},
};
const ECOM_UPGRADES={
  fitmentDb:{cost:75000,monthly:3000,name:"Fitment Database",desc:"Map tires to vehicles. Reduces returns 40%, boosts conversion",convBoost:.12,returnReduce:.4},
  mobileApp:{cost:100000,monthly:4000,name:"Mobile App",desc:"iOS/Android — captures 55% of tire shoppers",trafficBoost:.25,req:{seniorDev:true}},
  reviewPlatform:{cost:30000,monthly:800,name:"Review Platform",desc:"Verified customer reviews & ratings",convBoost:.08},
  photoStudio:{cost:40000,monthly:1500,name:"Photo Studio",desc:"360 tire views, on-vehicle renders",convBoost:.05,req:{photographer:true}},
  installerNet:{cost:50000,monthly:3500,name:"Installer Network",desc:"Partner shops for installation booking ($15/tire referral)",installRevPerTire:15},
  roadHazard:{cost:20000,monthly:500,name:"Road Hazard Program",desc:"Warranty add-on — $18/tire, 85% margin",warrantyPrice:18,warrantyMargin:.85,attachRate:.25},
  liveChat:{cost:15000,monthly:1000,name:"Live Chat System",desc:"Real-time customer support — reduces cart abandonment",convBoost:.04,req:{csRep:true}},
};
const ECOM_TIERS=[
  {min:0,label:"Invisible",marketShare:.0005,desc:"Page 10+ — nobody finds you"},
  {min:30000,label:"Startup",marketShare:.002,desc:"Page 5-8 for niche terms"},
  {min:100000,label:"Emerging",marketShare:.005,desc:"Page 2-3 for some searches"},
  {min:300000,label:"Growing",marketShare:.012,desc:"First page for long-tail keywords"},
  {min:800000,label:"Established",marketShare:.025,desc:"First page for major terms"},
  {min:2000000,label:"Competitive",marketShare:.045,desc:"Top 5 for most tire searches"},
  {min:5000000,label:"Major Player",marketShare:.075,desc:"Top 3 — competing with the big sites"},
  {min:12000000,label:"Dominant",marketShare:.12,desc:"Household name in online tires"},
];
function getEcomTier(totalSpent){let best=ECOM_TIERS[0];for(const t of ECOM_TIERS){if(totalSpent>=t.min)best=t;}return best;}
const ECOM_PAYMENT_FEE=.028;
const ECOM_BASE_RETURN_RATE=.08;
const ECOM_BASE_CONVERSION=.022;
const ECOM_SHIP_COST_RANGE=[14,28];
const ECOM_NATIONAL_MARKET=5000;
const ECOM_HOSTING_BASE=1500;
const ECOM_HOSTING_SCALE=500;

const MARKETPLACE={
  amazon:{name:"Amazon",fee:.15,monthlyFee:39.99,setupCost:2000,trafficMult:1.0,desc:"15% referral fee · massive traffic · brutal competition"},
  ebay:{name:"eBay",fee:.13,monthlyFee:0,setupCost:1000,trafficMult:.6,desc:"13% final value fee · auction + buy-now · good for clearance"},
};
const MARKETPLACE_UNLOCK=5000;
const MARKETPLACE_MIN_REP=20;
const MARKETPLACE_WEEKLY_DEMAND=300;

const LIQUIDATION={
  conditions:["discontinued","outOfSeason","customerReturn","overstock","damaged"],
  conditionDiscount:{discontinued:.45,outOfSeason:.55,customerReturn:.60,overstock:.65,damaged:.30},
  minLotSize:50,maxLotSize:2000,postingFee:500,expirationWeeks:8,
  aiPostFrequency:.3,
  aiLotNames:["TreadVault Online","WheelDeal Direct","TireSurplus Co","RubberRush.com","AllTread Digital","RimReady Online"],
};

const INSTALLER_NET={
  minRep:40,maintainRep:35,feePerInstall:18,ecommConvBoostPerInstaller:.005,
  maxInstallers:20,reviewPeriodWeeks:12,minInstallRate:.85,monthlyListingFee:200,
};

const MONET={
  adRevPerView:.003,premiumMonthly:4.99,premiumYearly:29.99,
  adContent:[
    {brand:"TireZone",text:"🔥 TireZone SALE — All-Season Starting $79!",color:"#e94560"},
    {brand:"AutoParts+",text:"⚡ AutoParts+ — Free Shipping on Orders $99+",color:"#4488cc"},
    {brand:"QuickLube Pro",text:"🛢️ QuickLube Pro — Oil Change $29.99",color:"#00d4aa"},
    {brand:"InsureMyRide",text:"🛡️ InsureMyRide — Save 15% on Auto Insurance",color:"#7b61ff"},
    {brand:"FleetMaster",text:"🚛 FleetMaster GPS — Track Every Truck",color:"#f0c040"},
    {brand:"TireTech Academy",text:"📚 TireTech Academy — Certify Your Techs",color:"#cc7733"},
  ],
  coinRewards:{weekSurvived:5,shopOpened:50,firstWarehouse:100,acquisitionComplete:75,revenueTarget100K:200,revenueTarget1M:500,wholesaleClientSigned:25,tpoContractSigned:40,ecomLaunched:150,distributorUnlocked:300,marketplaceLaunched:30,liquidationBought:20,liquidationSold:35,installerRecruited:25,becameInstaller:40},
  cosmetics:[
    {id:"gold_name",n:"Gold Name Badge",cost:200,desc:"Your name in gold on leaderboard"},
    {id:"custom_logo",n:"Custom Shop Logo",cost:100,desc:"Upload your own logo"},
    {id:"premium_truck",n:"Premium Delivery Truck",cost:150,desc:"Custom truck skin"},
    {id:"neon_sign",n:"Neon Shop Sign",cost:75,desc:"Animated sign on your shops"},
    {id:"fireworks",n:"Fireworks Celebration",cost:50,desc:"Fireworks on achievements"},
    {id:"map_trail",n:"Map Trail Effect",cost:120,desc:"Trail on the map showing your empire"},
  ],
};

// ============ HELPER FUNCTIONS ============
function getCap(g){return g.storage.reduce((a,s)=>a+STORAGE[s.type].cap,0)+g.locations.reduce((a,l)=>a+(l.locStorage||0),0);}
function getInv(g){return Object.values(g.inventory).reduce((a,b)=>a+b,0);}
function addA(arr,id){return arr.includes(id)?arr:[...arr,id];}
function getWealth(g){return Math.floor(g.cash+g.locations.length*120000+g.totalRev*.03);}
function getWsVolBonus(monthlyVol){let best=WS_VOL_BONUS[0];for(const t of WS_VOL_BONUS){if(monthlyVol>=t.minVol)best=t;}return best;}
function getWsMargin(g,client){
  const base=Rf(WS_BASE_MARGIN.min,WS_BASE_MARGIN.max);
  const volBonus=getWsVolBonus(g.monthlyPurchaseVol||0).bonus;
  const weeksActive=Math.max(0,(g.week||0)-(client?.joinedWeek||0));
  const relBonus=Math.min(.05,Math.floor(weeksActive/10)*WS_RELATIONSHIP_BONUS);
  return base+volBonus+relBonus;
}
function getWsAvailSpace(g){
  const totalCap=getCap(g);const ownInv=getInv(g);
  const tpoSpace=(g.tpoContracts||[]).reduce((a,c)=>{const brand=TPO_BRANDS.find(b=>b.id===c.brandId);if(!brand)return a;return a+Math.floor(Math.min(brand.tiresStored[1],(totalCap-ownInv)*.4));},0);
  return Math.max(0,totalCap-ownInv-tpoSpace);
}
function getWhStaffReq(g){
  const totalReq=g.storage.reduce((a,s)=>a+(STORAGE[s.type]?.staff||0),0);
  if(totalReq===0)return[];
  const reqs=[];
  if(totalReq>=1)reqs.push({role:"loader",need:Math.ceil(totalReq*.3)||1});
  if(totalReq>=2)reqs.push({role:"forklift",need:Math.ceil(totalReq*.2)||1});
  if(totalReq>=3){reqs.push({role:"receiving",need:1});reqs.push({role:"shipping",need:1});}
  if(totalReq>=5)reqs.push({role:"whMgr",need:1});
  if(totalReq>=6)reqs.push({role:"inventory",need:1});
  if(totalReq>=8){reqs.push({role:"dockSup",need:1});reqs.push({role:"logistics",need:1});}
  return reqs;
}
function getWhPayroll(g){return Object.entries(g.whStaff||{}).reduce((a,[k,v])=>a+(WH_ROLES[k]?.pay||0)*v,0);}
function getWhShortage(g){const reqs=getWhStaffReq(g);return reqs.reduce((a,r)=>{const have=g.whStaff?.[r.role]||0;return a+Math.max(0,r.need-have);},0);}
function canUnlockDist(g){return g.reputation>=DIST_MIN_REP&&g.locations.length>=DIST_MIN_LOCS&&g.storage.some(s=>s.type===DIST_MIN_STORAGE)&&g.hasWholesale&&g.cash>=DIST_UNLOCK_COST;}

// ============ REFERENCE NOTE ============
// The complete UI components (Card, Btn, LogW, MarketPanel, PricingPanel,
// SrcPanel, SellPanel, FleaPanel, SupPanel, GovPanel, CorpPanel, BankPanel,
// StaffPanel, WhStaffPanel, DivsPanel, LbPanel, Report, DistPanel, DistBrowse,
// BusinessOpsPanel, MfgPanel, VinnieAvatar, VinniePopup, VinnieTutorial,
// and the main TireEmpire component), plus the full simWeek() simulation
// engine (~700 lines), init() function, genAIShop(), initAIShops(),
// genGovBid(), and all 40+ Vinnie tips are in the original artifact source.
//
// This reference file contains ALL game constants and data structures needed
// for the constants/ extraction step. The UI and simulation code will be
// extracted in subsequent steps.
//
// Original file: 2,915 lines total
// Constants + data (this file): ~600 lines
// Simulation engine (simWeek): ~700 lines
// UI components: ~1,600 lines
