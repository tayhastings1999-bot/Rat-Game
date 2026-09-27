import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const V3=THREE.Vector3,TAU=Math.PI*2,PI2=Math.PI/2;
const rand=(a,b)=>a+Math.random()*(b-a),randi=(a,b)=>Math.floor(rand(a,b+1)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angD=(a,b)=>{const d=a-b;return((d+Math.PI)%TAU+TAU)%TAU-Math.PI;};
const $=id=>document.getElementById(id),hexs=h=>'#'+h.toString(16).padStart(6,'0'),rgb=h=>[h>>16&255,h>>8&255,h&255];
const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
const fmtT=s=>fmt(s)+'.'+Math.floor((s%1)*10);
const commas=n=>Math.round(n).toLocaleString('en-US');
const hashS=s=>{let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return h>>>0;};
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let R=Math.random;const rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>Math.floor(rr(a,b+1));
const shuffleR=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function weekSeed(){const d=new Date(),y=d.getUTCFullYear(),o=Date.UTC(y,0,1),w=Math.ceil(((d-o)/864e5+new Date(o).getUTCDay()+1)/7);return `TRIAL-${y}-W${w}`;}

// ---------- renderer + light pixel post ----------
const canvas=$('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,160);
const rt=new THREE.WebGLRenderTarget(2,2,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
const post=new THREE.ShaderMaterial({
  uniforms:{t:{value:rt.texture},time:{value:0},res:{value:new THREE.Vector2(2,2)},hurt:{value:0},low:{value:0},scent:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`uniform sampler2D t;uniform float time,hurt,low,scent;uniform vec2 res;varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 o=(vUv-.5)*.0016;
    vec3 c=vec3(texture2D(t,vUv+o).r,texture2D(t,vUv).g,texture2D(t,vUv-o).b);
    c=pow(max(c,0.),vec3(1./2.2));
    float l=dot(c,vec3(.3,.59,.11));c=mix(vec3(l),c,1.12);c=(c-.5)*1.06+.52;
    vec3 hi=max(c-vec3(.75),0.);
    c=mix(c,vec3(l*.42,l*.5,l*.66)+hi*2.2,scent*.85);
    c+=(hash(floor(vUv*res)+fract(time*7.)*vec2(37.,91.))-.5)*.03;
    vec2 q=vUv-.5;float v=dot(q,q);c*=1.-v*.55;
    c=mix(c,vec3(.7,.08,.05),clamp(hurt*.45+low*v*1.8*(.6+.4*sin(time*6.)),0.,.65));
    gl_FragColor=vec4(c,1.);
  }`
});
const postScene=new THREE.Scene(),postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),post));
function resize(){const W=Math.max(320,Math.floor(innerWidth/2)),H=Math.max(180,Math.floor(innerHeight/2));renderer.setSize(W,H,false);rt.setSize(W,H);post.uniforms.res.value.set(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
const hemi=new THREE.HemisphereLight(0xfff0dc,0x4a3a32,1.25);
const sun=new THREE.DirectionalLight(0xfff0e0,1.1);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0015;
Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:70});sun.shadow.camera.updateProjectionMatrix();
const lampL=[0,1,2,3].map(()=>{const l=new THREE.PointLight(0xffb060,4,20,1.3);scene.add(l);return l;});
const lantern=new THREE.PointLight(0xffd0a0,1.8,12,1.4);
scene.add(hemi,sun,sun.target,lantern);

// ---------- textures ----------
function ctex(size,draw,{rep=[1,1],srgb=true}={}){const cv=document.createElement('canvas');cv.width=cv.height=size;const x=cv.getContext('2d');draw(x,size);
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...rep);t.magFilter=THREE.NearestFilter;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;}
const noise=(x,s,n,lo,hi,w=1,h=1)=>{for(let i=0;i<n;i++){const v=randi(lo,hi);x.fillStyle=`rgb(${v},${v},${v})`;x.fillRect(randi(0,s-1),randi(0,s-1),w,randi(1,h));}};
const furTex=ctex(64,(x,s)=>{x.fillStyle='#e8e8e8';x.fillRect(0,0,s,s);noise(x,s,460,175,255,1,6);},{srgb:false});
const stoneTex=ctex(64,(x,s)=>{x.fillStyle='#e4e4e4';x.fillRect(0,0,s,s);noise(x,s,320,170,255,2,3);},{srgb:false});
const flameTex=ctex(64,(x)=>{const g=x.createRadialGradient(32,34,2,32,34,30);g.addColorStop(0,'rgba(255,250,225,1)');g.addColorStop(.3,'rgba(255,200,110,.9)');g.addColorStop(.7,'rgba(255,100,40,.3)');g.addColorStop(1,'rgba(255,60,20,0)');x.fillStyle=g;x.fillRect(0,0,64,64);});
function tiles(col,grout,T=16,crack=true){const[r,g,b]=rgb(col);return ctex(64,(x,s)=>{x.fillStyle=grout;x.fillRect(0,0,s,s);
  for(let j=0;j<s/T;j++)for(let i=0;i<s/T;i++){const k=rand(.85,1.12);x.fillStyle=`rgb(${Math.min(255,r*k)|0},${Math.min(255,g*k)|0},${Math.min(255,b*k)|0})`;x.fillRect(i*T+1,j*T+1,T-2,T-2);}
  for(let n=0;n<300;n++){x.fillStyle=`rgba(0,0,0,${rand(.04,.18)})`;x.fillRect(randi(0,s-1),randi(0,s-1),1,1);}
  if(crack){x.strokeStyle='rgba(0,0,0,.3)';for(let n=0;n<3;n++){x.beginPath();let px=rand(0,s),py=rand(0,s);x.moveTo(px,py);for(let q=0;q<4;q++){px+=rand(-6,6);py+=rand(-6,6);x.lineTo(px,py);}x.stroke();}}});}
const floorTex=tiles(0x8a8274,'#3a342c');
const brickTex=(()=>{const[r,g,b]=rgb(0x8a5a44);return ctex(64,(x,s)=>{x.fillStyle='#3a2620';x.fillRect(0,0,s,s);
  for(let j=0;j<5;j++)for(let i=0;i<3;i++){const k=rand(.8,1.15),o=(j%2)*11;x.fillStyle=`rgb(${Math.min(255,r*k)|0},${Math.min(255,g*k)|0},${Math.min(255,b*k)|0})`;x.fillRect((i*22+o)%s+1,j*13+1,20,11);if(o&&i===2)x.fillRect(1,j*13+1,9,11);}
  for(let n=0;n<240;n++){x.fillStyle=`rgba(0,0,0,${rand(.05,.2)})`;x.fillRect(randi(0,s-1),randi(0,s-1),1,1);}
  x.fillStyle='rgba(80,110,50,.35)';for(let n=0;n<14;n++)x.fillRect(randi(0,s-1),randi(40,s-1),randi(1,3),randi(2,8));});})();
const metalTex=ctex(64,(x,s)=>{x.fillStyle='#6a7078';x.fillRect(0,0,s,s);for(let i=0;i<4;i++){x.fillStyle='#565c64';x.fillRect(0,i*16,s,2);x.fillStyle='#8a929a';x.fillRect(0,i*16+2,s,1);}
  x.fillStyle='#3a3e44';for(let i=0;i<8;i++)for(let j=0;j<4;j++)x.fillRect(i*8+3,j*16+7,2,2);noise(x,s,120,80,120,1,1);});
const dryTex=ctex(64,(x,s)=>{x.fillStyle='#c8b894';x.fillRect(0,0,s,s);noise(x,s,300,150,210,2,2);x.strokeStyle='#8a7a5a';x.lineWidth=2;x.strokeRect(2,2,s-4,s-4);
  x.fillStyle='#6a5a3a';for(let i=0;i<6;i++){const px=randi(8,56),py=randi(8,56);x.fillRect(px,py,randi(3,8),2);}x.fillStyle='#e0d4b0';x.fillRect(10,30,44,3);});
const waterTex=ctex(64,(x,s)=>{x.fillStyle='#3a6a5a';x.fillRect(0,0,s,s);for(let i=0;i<80;i++){x.fillStyle=`rgba(${randi(120,180)},${randi(200,240)},${randi(170,210)},${rand(.15,.4)})`;x.fillRect(randi(0,s-1),randi(0,s-1),randi(2,6),1);}});
const acidTex=ctex(64,(x,s)=>{x.fillStyle='#7ab020';x.fillRect(0,0,s,s);for(let i=0;i<90;i++){x.fillStyle=`rgba(${randi(200,255)},255,${randi(60,120)},${rand(.2,.5)})`;x.fillRect(randi(0,s-1),randi(0,s-1),randi(1,4),randi(1,4));}});
const hashN=(x,y,s)=>{const v=Math.sin(x*12.9898+y*78.233+s*37.719)*43758.5453;return v-Math.floor(v);};
const atlas=ctex(128,(x)=>{
  const px=(X,Y,c)=>{x.fillStyle=c;x.fillRect(X,Y,1,1);};
  for(let f=0;f<4;f++){const ox=f*32,w=[.5,1,1.4,1.5][f],r0=[11,10,10,12.5][f],r1=[14,15,15,15][f];
    for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){const dx=xx-15.5,dy=yy-24.5,d=Math.hypot(dx,dy),a=Math.atan2(dx,-dy);
      if(Math.abs(a)<w&&d>=r0&&d<=r1)px(ox+xx,yy,f===3?(d>r1-1.3?'#ffe8b8':'rgba(216,134,74,.55)'):d>r1-1.3?'#ffffff':d>r1-2.6?'#ffe8b8':'#d8864a');
      else if(f<3&&Math.abs(a)<w+.14&&d>=r0-1&&d<=r1+1)px(ox+xx,yy,'#2a1008');}}
  for(let f=0;f<4;f++){const ox=f*32,oy=32,L=[4,7,10,11][f];for(let k=0;k<8;k++){const a=k*Math.PI/4,len=k%2?L*.6:L;for(let r=f===3?L*.6:0;r<len;r++)px(ox+Math.round(15.5+Math.cos(a)*r),oy+Math.round(15.5+Math.sin(a)*r),r<2?'#ffffff':r<len*.6?'#fff0a0':'#ff9a3a');}}
  for(let f=0;f<4;f++){const ox=f*32,oy=64,rd=[5,9,12,14][f];for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){const d=Math.hypot(xx-15.5,yy-15.5)+(hashN(xx,yy,f)-.5)*3;if(d>rd)continue;const k=d/rd;let c=null;
    if(f===0)c=k<.6?'#ffffff':'#fff0a0';else if(f===1)c=k<.4?'#fff0a0':k<.75?'#ffb040':'#e0501c';else if(f===2)c=k<.5?(hashN(xx,yy,9)<.4?null:'#ff8030'):k<.85?'#c0301c':'#5a1a14';else c=hashN(xx,yy,3)<.55?null:k>.6?'#3a2a2a':'#5a4040';if(c)px(ox+xx,oy+yy,c);}}
  for(let f=0;f<4;f++){const ox=f*32,oy=96,bl=[[16,16,6+f%2]];for(let i=0;i<8+f*2;i++){const a=hashN(i,f,1)*TAU,d=5+hashN(i,f,2)*9;bl.push([16+Math.cos(a)*d,16+Math.sin(a)*d,hashN(i,f,3)*2.2+.7]);}
    for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){let ins=false,core=false;for(const[bx,by,br]of bl){const d=Math.hypot(xx-bx,yy-by);if(d<br){ins=true;if(d<br*.55)core=true;}}if(ins)px(ox+xx,oy+yy,core?'#ffffff':'#a8a8a8');}}
});
atlas.minFilter=THREE.NearestFilter;
function atlasTex(row,col){const t=atlas.clone();t.needsUpdate=true;t.repeat.set(.25,.25);t.offset.set(col*.25,1-(row+1)*.25);t.magFilter=t.minFilter=THREE.NearestFilter;return t;}
const arrowTex=ctex(32,(x)=>{x.fillStyle='rgba(154,208,255,.95)';x.fillRect(13,10,6,18);for(let i=0;i<9;i++)x.fillRect(16-i,2+i,i*2,1);});

// ---------- geometry kit ----------
const EU=new THREE.Euler(),QU=new THREE.Quaternion(),M4=new THREE.Matrix4();
function prt(geo,col,p=[0,0,0],r=[0,0,0],s=[1,1,1]){geo=geo.index?geo.toNonIndexed():geo;M4.compose(new V3(...p),QU.setFromEuler(EU.set(...r)),new V3(...s));geo.applyMatrix4(M4);
  const c=new THREE.Color(col),n=geo.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}geo.setAttribute('color',new THREE.BufferAttribute(a,3));return geo;}
const Sp=(r,w=7,h=5)=>new THREE.SphereGeometry(r,w,h),Bx=(x,y,z)=>new THREE.BoxGeometry(x,y,z),Cy=(a,b,h,s=6)=>new THREE.CylinderGeometry(a,b,h,s),Co=(r,h,s=5)=>new THREE.ConeGeometry(r,h,s),To=(r,t,a)=>new THREE.TorusGeometry(r,t,4,10,a);
function spikes(n,col,cx,cy,cz,rx,ry,rz,len,w,seed){let s=seed;const rnd=()=>{s=(s*9301+49297)%233280;return s/233280;};const out=[],up=new V3(0,1,0);
  for(let i=0;i<n;i++){const th=rnd()*TAU,ph=rnd()*1.25,nv=new V3(Math.sin(ph)*Math.sin(th),Math.cos(ph),Math.sin(ph)*Math.cos(th)-.25).normalize();
    const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up,nv));out.push(prt(Co(w,len*(.7+rnd()*.6),4),col,[cx+nv.x*rx,cy+nv.y*ry,cz+nv.z*rz],[e.x,e.y,e.z]));}return out;}
function maw(x,y,z,s=1){const p=[prt(Sp(.16*s,6,4),0x9a0e0e,[x,y,z],[0,0,0],[1,.62,.5])];
  for(let i=-2;i<=2;i++){p.push(prt(Co(.026*s,.1*s,3),0xefe6d2,[x+i*.055*s,y+.07*s,z+.04*s],[Math.PI,0,0]));p.push(prt(Co(.026*s,.09*s,3),0xefe6d2,[x+i*.055*s,y-.07*s,z+.04*s]));}return p;}
const eyes=(pts,col,r=.055)=>pts.map(q=>prt(Sp(r,5,4),col,q));
const MG=g=>mergeGeometries(g);
const GEO={
  mawling:{body:MG([prt(Sp(.42,8,6),0x2e2434,[0,.42,0],[0,0,0],[1,.85,1.1]),...spikes(16,0x1c1622,0,.46,-.05,.4,.36,.46,.32,.07,3),
      ...[-1,1].flatMap(s=>[prt(Co(.05,.18,4),0xd8d0c0,[s*.22,.06,.34],[PI2,0,0]),prt(Co(.05,.18,4),0xd8d0c0,[s*.24,.06,-.2],[PI2,0,0])]),
      prt(To(.2,.045,Math.PI*1.6),0x3a2c3e,[0,.62,-.55],[0,PI2,0]),prt(To(.12,.035,Math.PI*1.6),0x3a2c3e,[0,.82,-.72],[0,PI2,0])]),
    glow:MG([...maw(0,.34,.45,1.3),...eyes([[-.15,.58,.36],[.15,.58,.36]],0xff3020)])},
  tick:{body:MG([prt(Sp(.34,8,6),0x6a1616,[0,.4,-.28],[0,0,0],[1,.8,1.25]),prt(Sp(.22,7,5),0x3a0c0c,[0,.32,.16]),...eyes([[-.13,.62,-.3],[.13,.62,-.36],[0,.66,-.12]],0x1a0606,.08),
      ...[-1,1].flatMap(s=>[0,1,2,3].flatMap(k=>{const z=.2-k*.16,ya=s*(k-1.5)*.35;return[prt(Bx(.55,.05,.05),0x2a0808,[s*.32,.46,z],[0,ya,s*.55]),prt(Bx(.55,.05,.05),0x2a0808,[s*.7,.24,z-s*ya*.25],[0,ya,-s*.9])];}))]),
    glow:MG([...eyes([[-.07,.38,.36],[.07,.38,.36],[-.14,.33,.33],[.14,.33,.33],[-.04,.45,.33],[.04,.45,.33]],0xff2a2a,.045),prt(Co(.03,.13,3),0xefe6d2,[-.05,.22,.36],[Math.PI,0,0]),prt(Co(.03,.13,3),0xefe6d2,[.05,.22,.36],[Math.PI,0,0])])},
  ghoul:{body:MG([prt(Sp(.62,8,6),0x2a2028,[0,.82,0],[-.2,0,0],[.9,.85,1.35]),prt(Sp(.5,7,5),0x221a22,[0,1.1,-.25]),prt(Sp(.36,7,5),0x2a2028,[0,.92,.85],[0,0,0],[1.05,.95,1.1]),
      ...spikes(24,0x15101a,0,1.02,-.1,.55,.55,.8,.44,.09,7),
      ...[-1,1].flatMap(s=>[prt(Cy(.1,.07,.7,5),0x1c151c,[s*.4,.35,.62],[.3,0,0]),prt(Cy(.11,.08,.7,5),0x1c151c,[s*.44,.35,-.6],[-.3,0,0]),...[-1,0,1].map(k=>prt(Co(.035,.2,3),0xd8d0c0,[s*.4+k*.06,.05,.86],[PI2,0,0]))]),
      prt(To(.32,.07,Math.PI*1.7),0x2a2028,[0,1.05,-1.28],[0,PI2,0]),prt(To(.2,.05,Math.PI*1.6),0x2a2028,[.36,.72,-1.12],[.4,PI2,0]),prt(To(.18,.045,Math.PI*1.6),0x2a2028,[-.36,.76,-1.06],[-.4,PI2,0])]),
    glow:MG([...maw(0,.8,1.2,1.45),...maw(-.27,1.0,1.06,1),...maw(.27,1.0,1.06,1),...eyes([[-.14,1.2,1.1],[.14,1.2,1.1],[-.31,1.14,1.0],[.31,1.14,1.0]],0xff3a20)])},
  bloat:{body:MG([prt(Sp(.62,8,6),0x8e9a70,[0,.74,0],[0,0,0],[1,1.05,1]),...[-1,1].flatMap(s=>[prt(Bx(.05,.6,.05),0x5a6a42,[s*.3,.82,.46],[.3,0,s*.3]),prt(Sp(.17,5,4),0x6a7650,[s*.42,.13,.3]),prt(Sp(.17,5,4),0x6a7650,[s*.42,.13,-.3])]),
      ...[[.3,1.1,-.2],[-.35,.9,-.35],[.1,1.25,.1],[-.2,.5,.5]].map(q=>prt(Sp(.11,5,4),0xb8c08a,q))]),
    glow:MG([prt(Sp(.25,6,4),0x8a1a0a,[0,.7,.56],[0,0,0],[1,.7,.4]),...eyes([[-.16,1.06,.46],[.13,1.13,.42],[0,1.22,.34]],0xffd84a,.06)])},
  bat:{body:MG([prt(Sp(.24,7,5),0x221c26,[0,.3,0],[0,0,0],[.9,.9,1.2]),prt(Sp(.16,6,4),0x221c26,[0,.42,.25]),prt(Co(.05,.2,3),0x221c26,[-.08,.62,.22]),prt(Co(.05,.2,3),0x221c26,[.08,.62,.22]),
      ...[-1,1].flatMap(s=>[prt(Bx(.9,.03,.5),0x4a1c24,[s*.55,.34,-.02],[0,0,s*.25]),prt(Bx(.9,.05,.05),0x15101a,[s*.55,.37,.22],[0,0,s*.25])])]),
    glow:MG([...eyes([[-.06,.46,.38],[.06,.46,.38]],0xff3a20,.04),prt(Co(.02,.08,3),0xefe6d2,[-.03,.33,.39],[Math.PI,0,0]),prt(Co(.02,.08,3),0xefe6d2,[.03,.33,.39],[Math.PI,0,0])])},
  brute:{body:MG([prt(Sp(.8,8,6),0x5a2a20,[0,1.25,0],[-.15,0,0],[.85,.85,1.3]),prt(Sp(.6,7,5),0x6a3426,[0,1.15,.5]),prt(Sp(.45,7,5),0x4a2218,[0,1.62,1.0]),
      ...[-1,1].flatMap(s=>[prt(Co(.12,.75,5),0xd8c8a0,[s*.3,2.08,.88],[-.5,0,s*-.6]),prt(Cy(.18,.14,1.1,6),0x3a1a14,[s*.45,.55,.6]),prt(Cy(.18,.14,1.1,6),0x3a1a14,[s*.45,.55,-.6]),...[-1,0,1].map(k=>prt(Co(.04,.22,3),0xd8d0c0,[s*.45+k*.08,.05,.82],[PI2,0,0]))]),
      ...spikes(12,0x2a1410,0,1.5,-.2,.6,.55,.9,.42,.1,11),prt(Cy(.08,.04,1.4,5),0x3a1a14,[0,1.4,-1.2],[-.7,0,0])]),
    glow:MG([...eyes([[-.17,1.74,1.36],[.17,1.74,1.36]],0xffa020,.07),...maw(0,1.46,1.42,1.5)])},
};
const EN={
  mawling:{hp:10,spd:4.6,dmg:8,r:.42,h:.7,xp:1,col:0x2e2434,blood:0x8a0c0c},
  tick:{hp:7,spd:6.2,dmg:6,r:.36,h:.5,xp:1,col:0x6a1616,blood:0xc01818},
  ghoul:{hp:34,spd:3.4,dmg:12,r:.62,h:1.3,xp:3,col:0x2a2028,blood:0x5a0606},
  bloat:{hp:40,spd:2.2,dmg:10,r:.66,h:1.3,xp:3,col:0x8e9a70,blood:0x8ac030,ranged:true},
  bat:{hp:12,spd:5.6,dmg:7,r:.45,h:.55,xp:2,col:0x221c26,blood:0xa01010,fly:true},
  brute:{hp:140,spd:3,dmg:20,r:.9,h:2.1,xp:10,col:0x5a2a20,blood:0x9a0c0c,leap:true,bar:true},
};
const bodyMat=()=>new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,map:furTex});
function mkIM(geo,mat,cap,col=true){const m=new THREE.InstancedMesh(geo,mat,cap);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(col)m.setColorAt(0,new THREE.Color(1,1,1));m.frustumCulled=false;m.count=0;scene.add(m);return m;}
const IMB={},IMG={};
for(const k in GEO){IMB[k]=mkIM(GEO[k].body,bodyMat(),160);IMB[k].castShadow=true;IMG[k]=mkIM(GEO[k].glow,new THREE.MeshBasicMaterial({vertexColors:true}),160,false);}
const gemIM=mkIM(new THREE.OctahedronGeometry(.16,0),new THREE.MeshBasicMaterial({color:0xff9a3a}),600,false);
const scrapIM=mkIM(new THREE.TorusGeometry(.14,.06,4,6),new THREE.MeshLambertMaterial({color:0xa8b0b8,emissive:0x202830,flatShading:true}),300,false);
const pprojIM=mkIM(new THREE.IcosahedronGeometry(.13,0),new THREE.MeshBasicMaterial(),320);
const eprojIM=mkIM(new THREE.IcosahedronGeometry(.19,0),new THREE.MeshBasicMaterial(),320);
const partIM=mkIM(Bx(.12,.12,.12),new THREE.MeshBasicMaterial(),700);
const scentIM=mkIM(new THREE.OctahedronGeometry(.16,0),new THREE.MeshBasicMaterial({transparent:true,opacity:.95,depthWrite:false}),600);
const decals=[0,1,2,3].map(i=>{const m=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-PI2),new THREE.MeshBasicMaterial({map:atlasTex(3,i),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),140);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.setColorAt(0,new THREE.Color());m.count=0;m.frustumCulled=false;scene.add(m);return{m,i:0,n:0};});
const dummy=new THREE.Object3D(),tmpC=new THREE.Color(),_v=new V3();

// ---------- data ----------
const CLASSES={
  brawler:{name:'Gutter Brawler',role:'Melee',rc:'#ff6a3a',blurb:'Iron-knuckled and stubborn. Wades into the swarm and rakes it apart.',hp:150,speed:7,armor:2,prim:'rake',special:'slam',fur:0xbab4a8,spike:0xc9a860,eye:0xffa040,gear:0x6a6672},
  plague:{name:'Plaguebearer',role:'Area',rc:'#9be06a',blurb:'Lobs blight and bursts it. Anything close starts to rot.',hp:120,speed:6.7,area:1.2,prim:'blight',special:'nova',fur:0x9a9e8a,spike:0x8a9a50,eye:0xc8f060,gear:0x3e4a2c},
  slinger:{name:'Sewer Slinger',role:'Ranged',rc:'#f2b233',blurb:'Quick feet, quicker stones. Kites the horde and never stops moving.',hp:95,speed:7.8,prim:'stone',special:'volley',fur:0xa08870,spike:0xa87a48,eye:0xffc040,gear:0x6a4a2c},
  warlock:{name:'Rat Warlock',role:'Magic',rc:'#b46cff',blurb:'Fragile, but the hex bolts find their mark. Blinks out of trouble.',hp:85,speed:7,cd:.9,prim:'hex',special:'blink',fur:0x6e6874,spike:0x8a6ab0,eye:0xc080ff,gear:0x2a2234},
};
const BOSSES={maw:{name:'The Many-Mouthed',geo:'ghoul',sc:3,hp:1500,spd:3.2},brood:{name:'The Brood Mother',geo:'tick',sc:4.4,hp:1300,spd:3.6},tabby:{name:'The Horned Tabby',geo:'brute',sc:2.1,hp:1700,spd:3.8}};
const MODS={
  currents:{name:'Erratic Currents',desc:'Vents shove you around, and some launch you skyward. Their direction keeps shifting.',col:'#9ad0ff'},
  gravity:{name:'Shifting Gravity',desc:'Zones flip between feather-light and crushing, then drift elsewhere.',col:'#c080ff'},
  decay:{name:'Corrosive Decay',desc:'Drifting fields of rot eat flesh. Lure the horde through them.',col:'#9be06a'},
  blackout:{name:'Blackout',desc:'The lamps are dead. Stay near your own light.',col:'#e0382c'},
};
const ITEMS={
  nail:{name:'Rusty Nail',flav:'Damage up',col:0xb0704a,ap:()=>st.dmg+=.3},
  lens:{name:'Cracked Lens',flav:'Range and shot speed up',col:0x9ad0ff,ap:()=>{st.range+=.4;st.shotSpd+=.25;}},
  bile:{name:'Sewer Bile',flav:'Poison shots',col:0x9be06a,ap:()=>st.poison=true},
  ember:{name:'Ember Tooth',flav:'Burning shots',col:0xff8a3a,ap:()=>st.burn=true},
  twin:{name:'Twin Tail',flav:'Double shot',col:0xe6c9a0,ap:()=>st.multi++},
  eye:{name:'Third Eye',flav:'Homing shots',col:0xc080ff,ap:()=>st.homing=true},
  heart:{name:'Rotten Heart',flav:'Max HP up',col:0xd8342c,ap:()=>{st.maxHp+=30;run.hp+=30;}},
  wing:{name:'Bat Wing',flav:'Extra jump in mid-air',col:0x5a4a60,ap:()=>st.jumps++},
  crown:{name:'Bone Crown',flav:'Cursed teeth circle you',col:0xe8dcc0,ap:()=>{const w=run.weapons.find(w=>w.id==='orbit');if(w)w.lvl=Math.min(5,w.lvl+1);else run.weapons.push({id:'orbit',lvl:1,t:0});}},
  runt:{name:'The Runt',flav:'A little rat fights beside you',col:0xbab4a8,ap:()=>addRunt()},
  rage:{name:'Blood Frenzy',flav:'Attack speed up',col:0xff3a3a,ap:()=>{st.tear*=.78;st.cd*=.92;}},
  paws:{name:'Cloven Paws',flav:'Speed up',col:0x7a5a40,ap:()=>st.speed*=1.12},
  shard:{name:'Shard Heart',flav:'Shots split on impact',col:0x6ad0d0,ap:()=>st.split=true},
  lode:{name:'Lodestone',flav:'Pickups come to you',col:0x8a8a9a,ap:()=>st.magnet*=2},
  foot:{name:'Rabbit Foot',flav:'Crit chance up',col:0xf2e0b0,ap:()=>st.crit+=.1},
  gland:{name:'Swollen Gland',flav:'Bigger shots, bigger blasts',col:0xa0b060,ap:()=>{st.area+=.25;st.shotSize+=.5;}},
  barbs:{name:'Barbed Hide',flav:'Enemies that touch you bleed',col:0x8a6a5a,ap:()=>st.thorns+=15},
  cheese:{name:'Moldy Cheese',flav:'Max HP up, a little',col:0xe8b84a,ap:()=>{st.maxHp+=15;run.hp=Math.min(st.maxHp,run.hp+30);}},
};
const AUG=[
  {id:'servo',br:'Mobility',name:'Claw Servos',cost:20,up:'Climbing costs 40% less and works on smooth metal',dn:'−10 max stamina',ap:()=>{st.climbCost*=.6;st.metalClimb=true;st.staMax-=10;}},
  {id:'burst',br:'Mobility',req:'servo',name:'Burst Thrusters',cost:35,up:'Sprint 80% faster',dn:'Sprinting drains stamina 50% faster',ap:()=>{st.sprintMul=1.8;st.sprintDrain*=1.5;}},
  {id:'glide',br:'Mobility',req:'burst',name:'Glide Membrane',cost:50,up:'Hold Space mid-air to glide, +1 air jump',dn:'−15 max HP',ap:()=>{st.glide=true;st.jumps++;st.maxHp-=15;run.hp=Math.min(run.hp,st.maxHp);}},
  {id:'incisor',br:'Offense',name:'Serrated Incisors',cost:15,up:'Gnaw twice as fast, +15% damage',dn:'−10 max HP',ap:()=>{st.chew*=2;st.dmg+=.15;st.maxHp-=10;run.hp=Math.min(run.hp,st.maxHp);}},
  {id:'cap',br:'Offense',req:'incisor',name:'Overcharged Capacitor',cost:30,up:'Special cooldown −40%',dn:'Take 15% more damage',ap:()=>{st.specCd*=.6;st.taken*=1.15;}},
  {id:'shrap',br:'Offense',req:'cap',name:'Shrapnel Core',cost:45,up:'Kills burst into shrapnel',dn:'Enemies move 10% faster',ap:()=>{st.shrap=true;st.foeSpd*=1.1;}},
  {id:'plate',br:'Survival',name:'Scrap Plating',cost:15,up:'+2 armor',dn:'−5% move speed',ap:()=>{st.armor+=2;st.speed*=.95;}},
  {id:'leech',br:'Survival',req:'plate',name:'Leech Filter',cost:30,up:'Heal 1 HP per kill',dn:'−20 max stamina',ap:()=>{st.leech=1;st.staMax-=20;}},
  {id:'reactor',br:'Survival',req:'leech',name:'Emergency Reactor',cost:45,up:'Once per run, survive a lethal hit at half HP',dn:'Stamina regen −25%',ap:()=>{run.reactor=true;st.staRegen*=.75;}},
];
const OBJ={cap:{name:'bottle cap',w:1.2,d:1.2,h:.35,mass:.1,col:0xc0302a},sponge:{name:'sponge',w:1.4,d:1.4,h:.9,mass:.18,col:0xe8c050},swab:{name:'cotton swab',w:.5,d:4.6,h:.25,mass:.14,col:0xf0ece0},crate:{name:'crate',w:1.3,d:1.3,h:1.2,mass:.35,col:0x8a6440},can:{name:'paint can',w:1.2,d:1.2,h:.9,mass:.3,col:0x7a8a9a}};


// ---------- state ----------
const T=4,GW=40,GH=40,WH=4.5,G=32,HALF=GW*T/2;
let grid=new Uint8Array(GW*GH),seen=new Uint8Array(GW*GH),flow=new Int16Array(GW*GH).fill(-1),spawnTiles=[];
let state='menu',time=0,shake=0,flash=0,mode='survival',followCam=true;
let camYaw=Math.PI,camPitch=.9,camDist=13,drag=0,lastDrag=0;
const camPos=new V3(0,12,12),camLook=new V3(),camOff=new V3();
const P={x:0,y:0,z:0,vx:0,vy:0,vz:0,onGround:true,coyote:0,buffer:0,air:0,facing:Math.PI,inv:0,slam:false,lock:0,jumping:false,cut:false,wx:0,wz:-1,fallV:0,aim:0,aimT:0,
  squeeze:false,carry:null,chewing:false,chewT:0,climbing:false,wallT:0,wallType:0,atk:0,acidT:0,scent:false,sprinting:false,staT:0,gmul:1};
let run={},st={};
let rooms=[],startRoom=null,objs=[],plats=[],inter=[],benches=[],chests=[],caches=[],pipes=[],lamps=[],valves=[],exitD=null,zones=[],tileMesh={};
let enemies=[],gems=[],scraps=[],pproj=[],eproj=[],parts=[],foods=[],familiars=[],boss=null,ghost=null,scentPaths=[];
const best=JSON.parse(localStorage.getItem('scurry4.best')||'{"time":0,"kills":0}');

// ---------- weapons / tomes / specials / primaries ----------
const near=(x,y,z,R)=>{const o=[];for(const e of enemies){if(e.dead)continue;const dx=e.x-x,dz=e.z-z,rr=R+e.r;if(dx*dx+dz*dz<rr*rr&&e.y<y+2.6&&e.y+e.h>y-2)o.push(e);}return o;};
const sorted=R=>{const o=[];for(const e of enemies){if(e.dead||e.pred&&e.mode==='patrol'&&!e.hurt)continue;const d=(e.x-P.x)**2+(e.z-P.z)**2;if(d<R*R)o.push([d,e]);}return o.sort((a,b)=>a[0]-b[0]).map(a=>a[1]);};
const nearest=R=>sorted(R)[0];
const auraR=w=>2.6*st.area*(1+.12*(w.lvl-1));
const WEAP={
  claw:{name:'Rending Claws',role:'Melee',desc:'Rake everything in front of you, automatically.',lv:['+Damage, +reach','+Damage','Also rakes behind you','+Damage, +reach'],cd:()=>.9,
    fire(w){const L=w.lvl,R=2.6*st.area*(1+.1*(L-1)),t=nearest(R+3),a=t?Math.atan2(t.x-P.x,t.z-P.z):P.facing,dm=20*(1+.28*(L-1));
      for(const A of L>=4?[a,a+Math.PI]:[a]){slashFx(A,R,0xffd8c0);for(const e of near(P.x,P.y,P.z,R+.3))if(Math.abs(angD(Math.atan2(e.x-P.x,e.z-P.z),A))<1.25)hit(e,dm,A,5,'claw');}}},
  whip:{name:'Tail Lash',role:'Melee',desc:'Spin and lash everything around you, hurling it back.',lv:['+Damage','Faster, +radius','+Damage','Faster, +radius'],cd:w=>1.9*(1-.08*(w.lvl-1)),
    fire(w){const L=w.lvl,R=3*st.area*(1+.08*(L-1)),dm=16*(1+.25*(L-1));for(let k=0;k<4;k++)slashFx(k*PI2+time,R,0xff9a7a);for(const e of near(P.x,P.y,P.z,R))hit(e,dm,Math.atan2(e.x-P.x,e.z-P.z),9,'whip');}},
  aura:{name:'Plague Cloud',role:'Area',desc:'A choking miasma that withers and slows nearby foes.',lv:['+Radius','+Damage','+Radius, +damage','+Damage, longer slow'],cd:()=>.45,
    fire(w){const L=w.lvl,dm=5*(1+.32*(L-1));for(const e of near(P.x,P.y,P.z,auraR(w))){hit(e,dm,null,0,'aura',true);e.slow=L>=5?1.5:.6;}}},
  flask:{name:'Rot Flask',role:'Area',desc:'Lob flasks of rot that burst into a caustic splash.',lv:['+Damage','+1 flask','+Radius, +damage','+1 flask'],cd:()=>2.1,
    fire(w){const L=w.lvl,ts=sorted(14);if(!ts.length)return false;const n=1+(L>=3)+(L>=5)+Math.min(1,st.proj);
      for(let i=0;i<n;i++){const t=ts[randi(0,Math.min(ts.length,6)-1)];lob(t.x+rand(-1,1),t.y,t.z+rand(-1,1),2.5*st.area*(1+.1*(L-1)),28*(1+.28*(L-1)),'flask');}}},
  sling:{name:'Sling Stones',role:'Ranged',desc:'Whip stones at the nearest threats, automatically.',lv:['+1 stone','Stones pierce a foe','+1 stone','Pierce two, +damage'],cd:()=>.75,
    fire(w){const L=w.lvl,n=1+(L>=2)+(L>=4)+st.proj,ts=sorted(18);if(!ts.length)return false;const pr=L>=5?2:L>=3?1:0,dm=13*(1+.2*(L-1))*(L>=5?1.2:1);
      for(let i=0;i<n;i++){const t=ts[i%ts.length];shoot(P.x,P.y+.7,P.z,t.x-P.x,t.y+t.h/2-(P.y+.7),t.z-P.z,26,dm,pr,'sling',{col:0xe8d8b0});}}},
  arc:{name:'Arc Lightning',role:'Magic',desc:'Lightning leaps from foe to foe.',lv:['+1 chain','+Damage','+1 strike','+2 chains'],cd:()=>1.4,
    fire(w){const L=w.lvl,ts=sorted(15);if(!ts.length)return false;const strikes=1+(L>=4)+Math.floor(st.proj/2),chains=2+(L>=2)+(L>=5)*2,dm=16*(1+.25*(L-1))*(L>=3?1.2:1);
      for(let s=0;s<strikes;s++)chain(ts[s%ts.length],chains,dm,'arc',[P.x,P.y+1.3,P.z]);}},
  orbit:{name:'Bone Halo',role:'Magic',desc:'Cursed teeth circle you, biting anything they touch.',lv:['+1 tooth','+Damage','+1 tooth, +radius','+1 tooth, +damage'],
    tick(w,dt){const L=w.lvl,n=2+L+(L>=4)+(L>=5)+st.proj-1,R=2.3*st.area*(L>=4?1.15:1),dm=10*(1+.25*(L-1))*(L>=5?1.2:1);w.a=(w.a||0)+dt*3.4;
      for(let i=0;i<n;i++){const o=orb(i),a=w.a+i*TAU/n,x=P.x+Math.sin(a)*R,z=P.z+Math.cos(a)*R,y=P.y+.7;o.visible=true;o.position.set(x,y,z);o.rotation.set(time*4,a,0);
        for(const e of enemies){if(e.dead)continue;const dx=e.x-x,dz=e.z-z,rr=e.r+.35;if(dx*dx+dz*dz<rr*rr&&y>e.y-.3&&y<e.y+e.h+.3&&time-(e.ot||0)>.4){e.ot=time;hit(e,dm,a+PI2,3,'orbit');}}}
      orbN=Math.max(orbN,n);}},
};
function chain(cur,chains,dm,src,from){const hs=new Set(),pts=[from];
  for(let c=0;c<=chains&&cur;c++){hs.add(cur);pts.push([cur.x,cur.y+cur.h*.6,cur.z]);hit(cur,dm,null,0,src);let b=null,bd=(6*st.area)**2;
    for(const e of enemies){if(e.dead||hs.has(e))continue;const d=(e.x-cur.x)**2+(e.z-cur.z)**2;if(d<bd){bd=d;b=e;}}cur=b;}
  bolt(pts);}
const TOMES={
  might:{name:'Tome of Might',d:v=>`+${Math.round(v*15)}% damage`,ap:v=>st.dmg+=.15*v},
  reach:{name:'Tome of Reach',d:v=>`+${Math.round(v*12)}% area`,ap:v=>st.area+=.12*v},
  haste:{name:'Tome of Haste',d:v=>`${Math.round(v*8)}% faster attacks`,ap:v=>{st.cd*=Math.pow(.92,v);st.tear*=Math.pow(.94,v);}},
  swift:{name:'Tome of Swiftness',d:v=>`+${Math.round(v*8)}% move speed`,ap:v=>st.speed*=1+.08*v},
  plenty:{name:'Tome of Plenty',d:()=>'+1 projectile, flask and tooth for weapons',ap:()=>st.proj++,max:3,flat:true},
  wings:{name:'Tome of Wings',d:()=>'+1 jump in mid-air',ap:()=>st.jumps++,max:2,flat:true},
  hide:{name:'Tome of Hide',d:v=>`+${Math.round(v*20)} max HP`,ap:v=>{st.maxHp+=Math.round(20*v);run.hp+=Math.round(20*v);}},
  hunger:{name:'Tome of Hunger',d:v=>`+${(v*.5).toFixed(1)} HP regen per second`,ap:v=>st.regen+=.5*v},
  lungs:{name:'Tome of Lungs',d:v=>`+${Math.round(v*20)} max stamina`,ap:v=>st.staMax+=Math.round(20*v)},
  cunning:{name:'Tome of Cunning',d:v=>`+${Math.round(v*6)}% crit chance`,ap:v=>st.crit+=.06*v},
  greed:{name:'Tome of Greed',d:v=>`+${Math.round(v*15)}% XP`,ap:v=>st.xp+=.15*v},
};
const RAR=[{n:'Common',m:1,c:'#9a96a0'},{n:'Rare',m:1.5,c:'#4aa3ff'},{n:'Epic',m:2,c:'#b35cff'},{n:'Legendary',m:3,c:'#ffb020'}];
const SPECIALS={
  slam:{name:'Leap Slam',cd:5,use(){P.vy=15;P.jumping=false;P.cut=true;const s=st.speed*1.2;P.vx=Math.sin(P.facing)*s;P.vz=Math.cos(P.facing)*s;P.slam=true;P.onGround=false;P.lock=.5;}},
  nova:{name:'Plague Nova',cd:7,use(){const R=6*st.area;aoe(P.x,P.y,P.z,R,45,14,'special',2.5,true);boom(P.x,P.y+.4,P.z,R*1.4,0xa9e06a);fx('ring',P.x,P.y,P.z,R,0xa9e06a,.5);shake=.3;}},
  volley:{name:'Stone Volley',cd:4.5,use(){for(let i=0;i<20;i++){const a=i/20*TAU;shoot(P.x,P.y+.7,P.z,Math.sin(a),0,Math.cos(a),22,18,2,'special',{col:0xf2d090});}}},
  blink:{name:'Blink',cd:3.5,use(){aoe(P.x,P.y,P.z,3*st.area,35,8,'special');boom(P.x,P.y+.5,P.z,3,0xc080ff);
    for(let s=7;s>0;s-=.5){const nx=P.x+P.wx*s,nz=P.z+P.wz*s;if(!solidFor(tileAt(nx,nz),true)||P.y>=WH-.1){P.x=nx;P.z=nz;break;}}
    P.inv=.5;aoe(P.x,P.y,P.z,3*st.area,35,8,'special');boom(P.x,P.y+.5,P.z,3,0xc080ff);}},
};
const PRIM={
  rake:{name:'Claw Rake',range:4.5,cd:.42,melee:true,fire(dx,dz){const a=Math.atan2(dx,dz),R=2.3*st.area,n=1+st.multi;
    for(let k=0;k<n;k++){const A=a+(k-(n-1)/2)*.6;slashFx(A,R,0xffffff);for(const e of near(P.x,P.y,P.z,R+.2))if(Math.abs(angD(Math.atan2(e.x-P.x,e.z-P.z),A))<1.1)hit(e,15,A,5,'primary',false,true);}}},
  blight:{name:'Blight Lob',range:11,cd:.8,fire(dx,dz,t){const n=1+st.multi,D=t?Math.hypot(t.x-P.x,t.z-P.z):6.5*st.range;
    for(let k=0;k<n;k++){const A=Math.atan2(dx,dz)+(k-(n-1)/2)*.3;lob(P.x+Math.sin(A)*D,t?t.y:P.y,P.z+Math.cos(A)*D,1.9*st.area,17,'primary');}}},
  stone:{name:'Sling Stone',range:13,cd:.3,fire(dx,dz,t){const n=1+st.multi,dy=t?(t.y+t.h*.5-(P.y+.7))/Math.max(1,Math.hypot(t.x-P.x,t.z-P.z)):0;
    for(let k=0;k<n;k++){const A=Math.atan2(dx,dz)+(k-(n-1)/2)*.16;shoot(P.x,P.y+.7,P.z,Math.sin(A),dy,Math.cos(A),20*st.shotSpd,7,0,'primary',{col:0xf4efe6});}}},
  hex:{name:'Hex Bolt',range:13,cd:.5,fire(dx,dz){const n=1+st.multi;
    for(let k=0;k<n;k++){const A=Math.atan2(dx,dz)+(k-(n-1)/2)*.3;shoot(P.x,P.y+.9,P.z,Math.sin(A),0,Math.cos(A),12*st.shotSpd,11,0,'primary',{homing:true,col:0xb46cff,life:1.5});}}},
};

// ---------- icons ----------
const SV=(p,s=22)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON={
  rake:SV('<path d="M5 19 13 5"/><path d="M10 20 18 7"/><path d="M15 21 21 11"/>'),claw:SV('<path d="M4 18 12 4"/><path d="M9 20 17 6"/><path d="M14 21 20 10"/>'),
  blight:SV('<path d="M9 3h6"/><path d="M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>'),flask:SV('<path d="M9 3h6"/><path d="M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 14h10"/>'),
  stone:SV('<circle cx="15" cy="12" r="4"/><path d="M3 9h6M2 13h6M4 17h5"/>'),sling:SV('<circle cx="15" cy="12" r="4"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/>'),
  hex:SV('<path d="M12 2 20 7v10l-8 5-8-5V7z"/><circle cx="12" cy="12" r="3"/>'),
  whip:SV('<path d="M12 12a3 3 0 1 1 3-3"/><path d="M15 9a6 6 0 1 1-6-6"/><path d="M3 21l6-6"/>'),
  aura:SV('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="10.5" stroke-dasharray="2 4"/>'),
  arc:SV('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  orbit:SV('<circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="18" cy="15.5" r="2" fill="currentColor"/><circle cx="6" cy="15.5" r="2" fill="currentColor"/>'),
  tome:SV('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/>'),
  heal:SV('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.8 3 13.5 3.5 12 5c-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'),
  gear:SV('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  slam:SV('<path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M3 20h18"/><path d="M6 17l-2 3M18 17l2 3"/>'),
  nova:SV('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>'),
  volley:SV('<circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>'),
  blink:SV('<path d="M4 12h10"/><path d="m10 6 6 6-6 6"/><path d="M20 4v16"/>'),
};
const IC_SCRAP=`<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#8a929a" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#2a2e34"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#000" stroke-width="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke="#b8c0c8" stroke-width="1.6"/></svg>`;
$('icHeart').innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="#d8342c" stroke="#000" stroke-width="2"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.8 3 13.5 3.5 12 5c-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></svg>`;
$('icBolt').innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="#3a8fe0" stroke="#000" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;

// ---------- fx ----------
const ringGeo=new THREE.RingGeometry(.86,1,32),discGeo=new THREE.CircleGeometry(1,32);
const fxs=[];
function fx(kind,x,y,z,R,col,life,ang=0,op=.8){let f=fxs.find(f=>!f.on&&f.kind===kind);
  if(!f){const m=new THREE.Mesh(kind==='disc'?discGeo:ringGeo,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-PI2;const g=new THREE.Group();g.add(m);scene.add(g);f={kind,g,m};fxs.push(f);}
  Object.assign(f,{on:true,life,max:life,R,op});f.m.material.color.set(col);f.g.position.set(x,y+.06,z);f.g.visible=true;return f;}
const pfxs=[];
function pfx(row,x,y,z,size,life,o={}){const gr=!!o.ground;let f=pfxs.find(f=>!f.on&&f.ground===gr);
  if(!f){const tex=atlasTex(row,0);let obj,mat;
    if(gr){mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide});const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);m.rotation.x=-PI2;obj=new THREE.Group();obj.add(m);}
    else{mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false});obj=new THREE.Sprite(mat);}
    scene.add(obj);f={obj,mat,tex,ground:gr};pfxs.push(f);}
  Object.assign(f,{on:true,row,life,max:life});f.mat.color.set(o.col??0xffffff);f.obj.visible=true;f.obj.position.set(x,y,z);f.obj.scale.set(size,size,size);
  if(gr)f.obj.rotation.y=(o.ang||0)+Math.PI;f.tex.offset.set(0,1-(row+1)*.25);return f;}
function slashFx(A,R,col){const s=R*2.1;pfx(0,P.x+Math.sin(A)*R*.5,P.y+.5,P.z+Math.cos(A)*R*.5,s,.2,{ground:true,ang:A,col});P.atk=.22;}
function boom(x,y,z,s,col=0xffffff){pfx(2,x,y,z,s,.32,{col});}
function spark(x,y,z,s=.9,col=0xffffff){pfx(1,x,y,z,s,.16,{col});}
const bolts=[];
function bolt(pts){let b=bolts.find(b=>!b.on);
  if(!b){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(64*3),3));const l=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xd8e8ff,transparent:true}));l.frustumCulled=false;scene.add(l);b={l};bolts.push(b);}
  const a=b.l.geometry.attributes.position.array;let n=0;
  for(let i=0;i<pts.length-1&&n<60;i++){const p=pts[i],q=pts[i+1];for(let s=0;s<4;s++){const t=s/4,j=s?.35:0;a[n*3]=p[0]+(q[0]-p[0])*t+rand(-j,j);a[n*3+1]=p[1]+(q[1]-p[1])*t+rand(-j,j);a[n*3+2]=p[2]+(q[2]-p[2])*t+rand(-j,j);n++;}}
  const l=pts[pts.length-1];a[n*3]=l[0];a[n*3+1]=l[1];a[n*3+2]=l[2];n++;
  b.l.geometry.setDrawRange(0,n);b.l.geometry.attributes.position.needsUpdate=true;b.on=true;b.life=.16;b.l.visible=true;
  for(let i=1;i<pts.length;i++)spark(pts[i][0],pts[i][1],pts[i][2],1.1,0xc8e0ff);}
function puff(x,y,z,col,n=6,s=3){for(let i=0;i<n;i++){if(parts.length>=700)parts.shift();parts.push({x,y,z,vx:rand(-1,1)*s,vy:rand(.3,1.4)*s,vz:rand(-1,1)*s,life:rand(.3,.6),c:col,s:1});}}
function blood(x,y,z,col,ang,n,sp=4){for(let i=0;i<n;i++){if(parts.length>=700)parts.shift();const a=ang==null?rand(0,TAU):ang+rand(-.8,.8),v=rand(1.5,sp);
  parts.push({x,y,z,vx:Math.sin(a)*v,vy:rand(2,6),vz:Math.cos(a)*v,life:1.4,c:col,b:true,s:rand(.8,1.5)});}}
function decal(x,y,z,s,col){const D=decals[randi(0,3)];dummy.position.set(x,y+.02+Math.random()*.02,z);dummy.rotation.set(0,rand(0,TAU),0);dummy.scale.set(s,1,s);dummy.updateMatrix();
  D.m.setMatrixAt(D.i,dummy.matrix);D.m.setColorAt(D.i,tmpC.setHex(col));D.i=(D.i+1)%140;D.n=Math.min(140,D.n+1);D.m.count=D.n;D.m.instanceMatrix.needsUpdate=true;D.m.instanceColor.needsUpdate=true;}
const auraG=new THREE.Group();
{const d=new THREE.Mesh(discGeo,new THREE.MeshBasicMaterial({color:0x6a9a3a,transparent:true,opacity:.22,depthWrite:false}));d.rotation.x=-PI2;
 const r=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xa9e06a,transparent:true,opacity:.5,depthWrite:false}));r.rotation.x=-PI2;auraG.add(d,r);scene.add(auraG);auraG.visible=false;}
const orbs=[];let orbN=0;const orbMat=new THREE.MeshLambertMaterial({color:0xe8dcc0,emissive:0x3a3020,flatShading:true});
function orb(i){while(orbs.length<=i){const m=new THREE.Mesh(Co(.14,.42,5),orbMat);m.castShadow=true;scene.add(m);orbs.push(m);}return orbs[i];}
const flasks=[];
function lob(tx,ty,tz,R,dm,src){let b=flasks.find(b=>!b.on);if(!b){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.2,0),new THREE.MeshBasicMaterial({color:0xa9e06a}));scene.add(m);b={m};flasks.push(b);}
  Object.assign(b,{on:true,sx:P.x,sy:P.y+1,sz:P.z,tx,ty,tz,t:0,R,dm,src});b.m.visible=true;P.atk=.2;}
function shoot(x,y,z,dx,dy,dz,spd,dmg,pierce,src,o={}){const d=Math.hypot(dx,dy,dz)||1;if(pproj.length>=320)return;const pr=src==='primary';
  pproj.push({x,y,z,vx:dx/d*spd,vy:dy/d*spd,vz:dz/d*spd,spd,life:(o.life||.75)*(pr?st.range:1),dmg,pierce,src,hs:new Set(),col:o.col||0xf4efe6,homing:o.homing||(pr&&st.homing),split:pr&&st.split&&!o.child,size:1+(pr?st.shotSize:0)*(o.child?.5:1),fx:pr});
  if(pr){spark(x+dx/d*.5,y,z+dz/d*.5,.6,o.col||0xffffff);P.atk=.18;}}
function glob(x,y,z,vx,vy,vz,dmg,col=0xff4a2a,slow=false){if(eproj.length<320)eproj.push({x,y,z,vx,vy,vz,life:4,dmg,col,slow});}

// ---------- damage numbers ----------
const nums=[];for(let i=0;i<48;i++){const d=document.createElement('div');d.className='num';document.body.appendChild(d);nums.push(d);}let numI=0;
function dnum(x,y,z,v,cls=''){_v.set(x,y,z).project(camera);if(_v.z>1||Math.abs(_v.x)>1.1||Math.abs(_v.y)>1.1)return;
  const el=nums[numI++%nums.length];el.textContent=v;el.className='num '+cls;const sx=(_v.x*.5+.5)*innerWidth+rand(-10,10),sy=(-_v.y*.5+.5)*innerHeight;
  el.animate([{transform:`translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${cls==='crit'?1.5:1.15})`,opacity:1},{transform:`translate(${sx}px,${sy-46}px) translate(-50%,-50%) scale(1)`,opacity:0}],{duration:cls==='info'?1300:650,easing:'cubic-bezier(.2,.7,.3,1)'});}

// ---------- combat ----------
let shrapQ=[];
function hit(e,base,ang,kb,src,quiet,itemFx){
  if(e.dead)return;let d=base*st.dmg;const crit=Math.random()<st.crit;if(crit)d*=2;d=Math.max(1,Math.round(d));
  e.hp-=d;e.flash=.1;e.hurt=true;run.dmgBy[src]=(run.dmgBy[src]||0)+d;run.dmg+=d;
  if(itemFx){if(st.poison){e.pT=3;e.pD=4*st.dmg;}if(st.burn){e.bT=2;e.bD=7*st.dmg;}}
  if(kb&&ang!=null&&!e.heavy){e.kx+=Math.sin(ang)*kb;e.kz+=Math.cos(ang)*kb;}
  if(!quiet||crit){blood(e.x,e.y+e.h*.6,e.z,e.blood,ang,crit?6:3);spark(e.x,e.y+e.h*.6,e.z,crit?1.4:.8);}
  if(!quiet||crit||Math.random()<.3)dnum(e.x,e.y+e.h+.3,e.z,d,crit?'crit':'');
  if(e.hp<=0)kill(e);}
function aoe(x,y,z,R,dm,kb,src,slow,itemFx){const m=1+.05*(run.level-1);for(const e of near(x,y,z,R)){hit(e,dm*m,Math.atan2(e.x-x,e.z-z),kb,src,false,itemFx);if(slow)e.slow=slow;}}
function hurtP(d,from,raw){
  if(state!=='play')return;if(!raw&&P.inv>0)return;
  d=Math.max(1,Math.round(d*st.taken*(1+.1*run.tier)-(raw?0:st.armor)));run.hp-=d;if(!raw)P.inv=.6;flash=Math.max(flash,raw?.35:1);shake=Math.max(shake,raw?.08:.25);
  if(from){const dx=P.x-from.x,dz=P.z-from.z,l=Math.hypot(dx,dz)||1;P.vx+=dx/l*6;P.vz+=dz/l*6;}
  blood(P.x,P.y+.5,P.z,0xa01010,raw?2:6,null);if(!raw)dnum(P.x,P.y+1.4,P.z,'-'+d,'heal');
  if(run.hp<st.maxHp*.3&&!run.lowWarned){run.lowWarned=true;banner('Rat needs cheese, badly!','Press F to sniff out a food cache');}
  if(run.hp<=0){if(run.reactor){run.reactor=false;run.hp=st.maxHp*.5;P.inv=2;banner('Emergency Reactor','Back from the brink');boom(P.x,P.y+.5,P.z,5,0x9ad0ff);return;}die();}}
function kill(e){
  if(e.dead)return;e.dead=true;run.kills++;
  blood(e.x,e.y+e.h*.5,e.z,e.blood,null,e.boss||e.pred?30:12,e.boss?8:5);puff(e.x,e.y+e.h/2,e.z,e.col,e.boss?20:5,3.5);
  boom(e.x,e.y+e.h*.5,e.z,(e.boss||e.pred?5:1.6)*(e.sc||1),e.blood);decal(e.x,floorY(e.x,e.z)+.01,e.z,rand(1.2,2.2)*(e.boss||e.pred?2.5:1)*(e.sc||1),e.blood);
  if(st.leech)run.hp=Math.min(st.maxHp,run.hp+st.leech);
  if(st.shrap&&!e.boss)shrapQ.push([e.x,e.y,e.z]);
  if(e.type==='nest'){world.remove(e.mesh);run.nests--;for(let i=0;i<10;i++)scrapDrop(e.x,e.y,e.z);if(Math.random()<.6)dropFood(e.x,e.y,e.z);dnum(e.x,e.y+2,e.z,'Nest destroyed','info');shake=.35;return;}
  if(e.boss){scene.remove(e.mesh);boss=null;$('bossWrap').style.display='none';shake=1;for(let i=0;i<14;i++)dropGem(e.x+rand(-3,3),e.y,e.z+rand(-3,3),12);for(let i=0;i<25;i++)scrapDrop(e.x,e.y,e.z);
    addChest(e.x,floorY(e.x,e.z),e.z);banner(BOSSES[e.kind].name+' falls','It left something behind');return;}
  if(e.pred){scene.remove(e.mesh);for(let i=0;i<15;i++)scrapDrop(e.x,e.y,e.z);dropFood(e.x,e.y,e.z);dnum(e.x,e.y+2,e.z,'Predator slain','info');return;}
  dropGem(e.x,e.y,e.z,e.xp);if(Math.random()<.3)scrapDrop(e.x,e.y,e.z);if(Math.random()<.012)dropFood(e.x,e.y,e.z);if(e.elite)for(let i=0;i<4;i++)scrapDrop(e.x,e.y,e.z);}
function dropGem(x,y,z,v){if(gems.length>=580){gems[randi(0,gems.length-1)].v+=v;return;}gems.push({x,y,z,v,pull:false,s:0,ph:rand(0,6)});}
function scrapDrop(x,y,z){if(scraps.length<290)scraps.push({x:x+rand(-.6,.6),y,z:z+rand(-.6,.6),pull:false,s:0,ph:rand(0,6)});}
const foodMat=new THREE.MeshLambertMaterial({color:0xe8b84a,emissive:0x4a3000,flatShading:true});
function dropFood(x,y,z){const m=new THREE.Mesh(Cy(.35,.35,.25,10),foodMat);m.castShadow=true;world.add(m);foods.push({x,y,z,m});}
function gainXP(v){run.xp+=v*st.xp;while(run.xp>=run.need){run.xp-=run.need;run.level++;run.need=need(run.level);run.pendingLv++;}if(run.pendingLv&&state==='play')openLevelUp();}
const need=L=>Math.floor(6+(L-1)*5+Math.pow(L-1,1.5));

// ---------- map ----------
const world=new THREE.Group();scene.add(world);
const gi=(gx,gz)=>gz*GW+gx,inG=(gx,gz)=>gx>=0&&gz>=0&&gx<GW&&gz<GH;
const toG=v=>Math.floor(v/T+GW/2),toW=g=>(g-GW/2+.5)*T;
const tAt=(gx,gz)=>inG(gx,gz)?grid[gi(gx,gz)]:0,tileAt=(x,z)=>tAt(toG(x),toG(z));
const OPEN=t=>t===1||t===2||t===4;
const solidFor=(t,isP)=>t===0||t===6||t===3||(t===5&&!(isP&&P.squeeze));
function floorY(x,z,isP){const t=tileAt(x,z);return t===2||t===4?-.9:solidFor(t,isP)?WH:0;}
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function bfs(sx,sy,pass){const d=new Int16Array(GW*GH).fill(-1),q=new Int32Array(GW*GH);let h=0,t=0;if(!inG(sx,sy))return d;d[gi(sx,sy)]=0;q[t++]=gi(sx,sy);
  while(h<t){const c=q[h++],x=c%GW,y=(c/GW)|0,nd=d[c]+1;for(const[dx,dy]of N4){const X=x+dx,Y=y+dy;if(!inG(X,Y))continue;const k=gi(X,Y);if(d[k]>=0||!pass(grid[k]))continue;d[k]=nd;q[t++]=k;}}return d;}
function descend(d,gx,gz,maxN=80){const out=[];let x=gx,y=gz;if(!inG(x,y)||d[gi(x,y)]<0)return out;
  for(let n=0;n<maxN;n++){out.push(gi(x,y));const cd=d[gi(x,y)];if(cd<=0)break;let bx=-1,by=-1;for(const[dx,dy]of N4){const X=x+dx,Y=y+dy;if(inG(X,Y)&&d[gi(X,Y)]>=0&&d[gi(X,Y)]<cd){bx=X;by=Y;break;}}if(bx<0)break;x=bx;y=by;}return out;}
function nearOpen(gx,gz){if(OPEN(tAt(gx,gz)))return[gx,gz];for(let r=1;r<4;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(OPEN(tAt(gx+dx,gz+dy)))return[gx+dx,gz+dy];return[gx,gz];}
const roomTiles=r=>{const o=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(grid[gi(x,y)]===1)o.push([x,y]);return o;};
const wallAdj=r=>{const o=[];for(const[x,y]of roomTiles(r))for(const[dx,dy]of N4){const t=tAt(x+dx,y+dy);if(t===0||t===6){o.push({x,y,dx,dy,t});}}return o;};
function genMap(seed){
  R=mulberry(hashS(seed));grid.fill(0);seen.fill(0);rooms=[];
  for(let a=0;a<700&&rooms.length<15;a++){const w=ri(4,8),h=ri(4,7),x=ri(2,GW-w-2),y=ri(2,GH-h-2);if(rooms.some(r=>x<r.x+r.w+2&&x+w+2>r.x&&y<r.y+r.h+2&&y+h+2>r.y))continue;rooms.push({x,y,w,h,cx:x+(w>>1),cy:y+(h>>1)});}
  for(const r of rooms)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)grid[gi(x,y)]=1;
  const carve=(ax,ay,bx,by,t)=>{const set=(x,y)=>{for(const[ox,oy]of[[0,0],[1,0],[0,1],[1,1]]){const X=x+ox,Y=y+oy;if(X>0&&Y>0&&X<GW-1&&Y<GH-1&&grid[gi(X,Y)]===0)grid[gi(X,Y)]=t;}};
    let x=ax,y=ay;while(x!==bx){set(x,y);x+=Math.sign(bx-x);}while(y!==by){set(x,y);y+=Math.sign(by-y);}set(x,y);};
  const con=[rooms[0]],left=rooms.slice(1),links=[];
  while(left.length){let bi=0,bj=0,bd=1e9;left.forEach((r,i)=>con.forEach((c,j)=>{const d=Math.abs(r.cx-c.cx)+Math.abs(r.cy-c.cy);if(d<bd){bd=d;bi=i;bj=j;}}));const r=left.splice(bi,1)[0];links.push([con[bj],r]);con.push(r);}
  for(let i=0;i<3;i++){const a=rooms[ri(0,rooms.length-1)],b=rooms[ri(0,rooms.length-1)];if(a!==b)links.push([a,b]);}
  for(const[a,b]of links){const q=R();carve(a.cx,a.cy,b.cx,b.cy,q<.28?2:q<.46?4:1);}
  startRoom=rooms[0];
  for(const r of rooms)if(r!==startRoom&&R()<.25&&r.w>=6&&r.h>=5)for(let y=r.y+2;y<r.y+r.h-2;y++)for(let x=r.x+2;x<r.x+r.w-2;x++)grid[gi(x,y)]=2;
  let dist=bfs(startRoom.cx,startRoom.cy,OPEN);
  const byDist=rooms.filter(r=>r!==startRoom).sort((a,b)=>dist[gi(b.cx,b.cy)]-dist[gi(a.cx,a.cy)]);
  const metal=shuffleR(byDist.slice(2,9)).slice(0,2);metal.forEach(r=>{r.metal=true;for(let y=r.y-1;y<=r.y+r.h;y++)for(let x=r.x-1;x<=r.x+r.w;x++)if(inG(x,y)&&grid[gi(x,y)]===0)grid[gi(x,y)]=6;});
  const cand=[];for(let y=1;y<GH-1;y++)for(let x=1;x<GW-1;x++){if(grid[gi(x,y)]!==0)continue;const L=tAt(x-1,y),Rr=tAt(x+1,y),U=tAt(x,y-1),D=tAt(x,y+1);
    let a=null,b=null;if(OPEN(L)&&OPEN(Rr)&&!OPEN(U)&&!OPEN(D)){a=gi(x-1,y);b=gi(x+1,y);}else if(OPEN(U)&&OPEN(D)&&!OPEN(L)&&!OPEN(Rr)){a=gi(x,y-1);b=gi(x,y+1);}
    if(a!=null&&dist[a]>=0&&dist[b]>=0&&Math.abs(dist[a]-dist[b])>10)cand.push(gi(x,y));}
  shuffleR(cand);cand.slice(0,7).forEach(k=>grid[k]=3);cand.slice(7,12).forEach(k=>grid[k]=5);
  const pockets=[];
  for(const r of shuffleR(rooms.filter(r=>r!==startRoom&&!r.metal)).slice(0,6)){if(pockets.length>=4)break;
    for(let tries=0;tries<6;tries++){const d=N4[ri(0,3)],[dx,dy]=d;let ex,ey;
      if(dx){ex=dx>0?r.x+r.w:r.x-1;ey=ri(r.y+1,r.y+r.h-2);}else{ey=dy>0?r.y+r.h:r.y-1;ex=ri(r.x+1,r.x+r.w-2);}
      const px=ex+dx*1.5,py=ey+dy*1.5;let ok=grid[gi(ex,ey)]===0;
      for(let y=Math.round(py)-2;y<=Math.round(py)+2&&ok;y++)for(let x=Math.round(px)-2;x<=Math.round(px)+2;x++){if(!inG(x,y)||x<1||y<1||x>=GW-1||y>=GH-1||grid[gi(x,y)]!==0){if(!(x===ex&&y===ey)){ok=false;break;}}}
      if(!ok)continue;const cells=[];for(let k=1;k<=2;k++)for(let s=0;s<2;s++){const x=ex+dx*k+(dy?s:0),y=ey+dy*k+(dx?s:0);cells.push([x,y]);}
      if(cells.some(([x,y])=>!inG(x,y)||grid[gi(x,y)]!==0))continue;cells.forEach(([x,y])=>grid[gi(x,y)]=1);grid[gi(ex,ey)]=3;pockets.push(cells);break;}}
  dist=bfs(startRoom.cx,startRoom.cy,OPEN);
  return{dist,pockets,byDist,metal};}


// ---------- build world ----------
const lam=(c,o={})=>new THREE.MeshLambertMaterial({color:c,flatShading:true,...o});
const waterMat=new THREE.MeshLambertMaterial({map:waterTex,transparent:true,opacity:.78,emissive:0x0a2018});
const acidMat=new THREE.MeshBasicMaterial({map:acidTex,transparent:true,opacity:.85});
acidTex.repeat.set(1,1);waterTex.repeat.set(1,1);
function buildWorld(){
  world.traverse(o=>{if(o.geometry)o.geometry.dispose();});world.clear();tileMesh={};
  const fl=[],bed=[],wall=[],met=[],wat=[],acd=[];
  for(let gz=0;gz<GH;gz++)for(let gx=0;gx<GW;gx++){const t=grid[gi(gx,gz)],cx=toW(gx),cz=toW(gz);
    if(t===1||t===3||t===5)fl.push(new THREE.BoxGeometry(T,1,T).translate(cx,-.5,cz));
    if(t===2||t===4){bed.push(new THREE.BoxGeometry(T,1,T).translate(cx,-1.4,cz));(t===2?wat:acd).push(new THREE.PlaneGeometry(T,T).rotateX(-PI2).translate(cx,-.35,cz));}
    if((t===0||t===6)&&N4.some(([dx,dy])=>{const n=tAt(gx+dx,gz+dy);return n!==0&&n!==6;})){const g=new THREE.BoxGeometry(T,WH+1,T);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*1.4);(t===0?wall:met).push(g.translate(cx,(WH-1)/2,cz));}
    if(t===3){const m=new THREE.Mesh(new THREE.BoxGeometry(T,WH+1,T).translate(0,(WH-1)/2,0),lam(0xffffff,{map:dryTex}));m.position.set(cx,0,cz);m.castShadow=m.receiveShadow=true;world.add(m);tileMesh[gi(gx,gz)]=m;}
    if(t===5){const g=new THREE.Group(),alongX=OPEN(tAt(gx-1,gz))||tAt(gx-1,gz)===5,wm=lam(0xffffff,{map:brickTex}),s=(T-.7)/2;
      for(const k of[-1,1]){const m=new THREE.Mesh(alongX?new THREE.BoxGeometry(T,WH+1,s):new THREE.BoxGeometry(s,WH+1,T),wm);m.position.set(alongX?0:k*(s/2+.35),(WH-1)/2,alongX?k*(s/2+.35):0);m.castShadow=true;g.add(m);}
      const cap=new THREE.Mesh(new THREE.BoxGeometry(T,.5,T),wm);cap.position.y=WH-.25;g.add(cap);g.position.set(cx,0,cz);world.add(g);}}
  const add=(arr,mat,cast)=>{if(!arr.length)return;const m=new THREE.Mesh(mergeGeometries(arr),mat);m.receiveShadow=true;m.castShadow=!!cast;world.add(m);};
  add(fl,lam(0xffffff,{map:floorTex}));add(bed,lam(0x2a3a30));add(wall,lam(0xffffff,{map:brickTex}),true);add(met,lam(0xffffff,{map:metalTex}),true);add(wat,waterMat);add(acd,acidMat);
  for(const D of decals){D.n=0;D.i=0;D.m.count=0;}}
function wallPos(w,inset=.15){return[toW(w.x)+w.dx*(T/2-inset),toW(w.y)+w.dy*(T/2-inset)];}
function mkMesh(geo,mat,x,y,z,par=world){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;par.add(m);return m;}
function glowSprite(col,s,par,x=0,y=0,z=0,op=.8){const g=new THREE.Sprite(new THREE.SpriteMaterial({map:flameTex,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op}));g.scale.set(s,s,1);g.position.set(x,y,z);par.add(g);return g;}
function staticBox(x,z,w,d,h,mat){const m=mkMesh(new THREE.BoxGeometry(w,h,d),mat,x,h/2,z);const p={x,z,w,d,y:h,th:h,mesh:m};plats.push(p);return p;}
function addObj(kind,x,z,y){const O=OBJ[kind],o={kind,x,z,w:O.w,d:O.d,th:O.h,mass:O.mass,vy:0,carried:false};
  let g;if(kind==='swab'){g=new THREE.Group();mkMesh(Cy(.08,.08,4.2,5),lam(0xf0ece0),0,0,0,g).rotation.x=PI2;for(const s of[-1,1])mkMesh(Sp(.28,6,4),lam(0xfaf8f0,{map:furTex}),0,0,s*2.2,g).scale.set(1,.8,1.3);}
  else if(kind==='cap'){g=new THREE.Group();mkMesh(Cy(.6,.6,.35,12),lam(O.col,{map:stoneTex}),0,0,0,g);mkMesh(Cy(.4,.4,.02,10),lam(0xf0e0d0),0,.18,0,g);}
  else if(kind==='sponge'){g=new THREE.Group();mkMesh(Bx(1.4,.6,1.4),lam(O.col,{map:stoneTex}),0,.15,0,g);mkMesh(Bx(1.4,.3,1.4),lam(0x3a8a4a,{map:stoneTex}),0,-.3,0,g);}
  else if(kind==='can'){g=new THREE.Group();mkMesh(Cy(.6,.6,.9,10),lam(O.col,{map:metalTex}),0,0,0,g);mkMesh(Cy(.62,.62,.12,10),lam(0xc05030),0,.3,0,g);}
  else{g=new THREE.Group();const wm=lam(O.col,{map:stoneTex});mkMesh(Bx(1.3,1.2,1.3),wm,0,0,0,g);mkMesh(Bx(1.34,.12,1.34),lam(0x5a3e26),0,.4,0,g);mkMesh(Bx(1.34,.12,1.34),lam(0x5a3e26),0,-.4,0,g);}
  world.add(g);o.mesh=g;o.y=(y??floorY(x,z))+o.th;o.plat=o;plats.push(o);objs.push(o);syncObj(o);return o;}
function syncObj(o){o.mesh.position.set(o.x,o.y-o.th/2,o.z);o.mesh.rotation.y=o.kind==='swab'&&o.w>o.d?PI2:0;}
function addChest(x,y,z){const g=new THREE.Group(),w=lam(0x6a4424,{map:stoneTex}),b=lam(0xd9a441,{emissive:0x3a2a08});
  mkMesh(Bx(1,.6,.7),w,0,.3,0,g);const lid=new THREE.Group();lid.position.set(0,.6,-.35);mkMesh(Bx(1.02,.25,.72),w,0,.12,.35,lid);g.add(lid);mkMesh(Bx(1.05,.1,.74),b,0,.5,0,g);mkMesh(Bx(.16,.2,.1),b,0,.45,.37,g);
  glowSprite(0xffc060,1.6,g,0,.8,0,.5);g.position.set(x,y,z);g.rotation.y=rand(0,TAU);world.add(g);chests.push({x,y,z,g,lid,open:false});}
function addCache(x,y,z){const g=new THREE.Group();mkMesh(Cy(.45,.45,.35,10),foodMat,0,.2,0,g);mkMesh(Cy(.3,.3,.3,10),foodMat,.2,.5,.1,g);glowSprite(0xffe070,1.2,g,0,.4,0,.35);g.position.set(x,y,z);world.add(g);caches.push({x,y,z,g,taken:false});}
function addBench(x,z,rot){const g=new THREE.Group(),wd=lam(0x5a3e26,{map:stoneTex}),mt=lam(0x8a929a,{map:metalTex});
  mkMesh(Bx(2.2,.15,1.1),wd,0,1,0,g);for(const s of[-1,1])for(const t of[-1,1])mkMesh(Bx(.12,1,.12),wd,s*.95,.5,t*.45,g);
  mkMesh(Bx(.4,.35,.3),mt,-.6,1.25,0,g);mkMesh(Cy(.18,.18,.2,8),mt,.5,1.2,.1,g);mkMesh(Bx(.6,.4,.05),new THREE.MeshBasicMaterial({color:0x4aa3ff}),0,1.5,-.4,g);
  glowSprite(0x4aa3ff,2,g,0,1.6,0,.5);g.position.set(x,0,z);g.rotation.y=rot;world.add(g);benches.push({x,z,g});plats.push({x,z,w:2,d:1.1,y:1.07,th:1.07});}
function addPipe(w){const[x,z]=wallPos(w,.3),g=new THREE.Group();const m=mkMesh(Cy(.7,.7,.6,12),lam(0x5a6068,{map:metalTex}),0,.75,0,g);m.rotation.x=PI2;
  mkMesh(new THREE.CircleGeometry(.55,12),new THREE.MeshBasicMaterial({color:0x050404}),0,.75,.31,g);g.position.set(x,0,z);g.rotation.y=Math.atan2(-w.dx,-w.dy);world.add(g);
  const p={x:toW(w.x)-w.dx*.2,z:toW(w.y)-w.dy*.2,ex:toW(w.x)-w.dx*1.4,ez:toW(w.y)-w.dy*1.4,g,link:null};pipes.push(p);return p;}
function addRope(r){const tl=roomTiles(r).filter(([x,y])=>x>r.x&&x<r.x+r.w-1&&y>r.y&&y<r.y+r.h-1);if(!tl.length)return;const[cx,cy]=tl[ri(0,tl.length-1)],x=toW(cx),z=toW(cy);
  const beam=mkMesh(Cy(.25,.25,r.w*T+2,8),lam(0x5a6068,{map:metalTex}),toW(r.x)+(r.w*T)/2-T/2,5,z);beam.rotation.z=PI2;
  const can=new THREE.Group();mkMesh(Cy(.7,.7,1,10),lam(0x7a8a9a,{map:metalTex}),0,0,0,can);mkMesh(Cy(.72,.72,.14,10),lam(0xc05030),0,.35,0,can);can.position.set(x,3.6,z);world.add(can);
  const rope=mkMesh(Cy(.03,.03,1,4),lam(0xc8b890),x,4.3,z);rope.scale.y=1.4;
  const wa=wallAdj(r);if(!wa.length)return;const w=wa[ri(0,wa.length-1)],[px,pz]=wallPos(w,.5);const post=mkMesh(Bx(.3,2.2,.3),lam(0x7a5a3a,{map:stoneTex}),px,1.1,pz);
  inter.push({kind:'rope',x:px,z:pz,post,can,rope,cx:x,cz:z,used:false,vy:0,falling:false});}
function addWire(w){const[x,z]=wallPos(w,.2),g=new THREE.Group();mkMesh(Bx(.8,.8,.3),lam(0x4a4e54,{map:metalTex}),0,1.8,0,g);
  for(const s of[-1,1])mkMesh(Cy(.04,.04,1.6,4),lam(s>0?0xd8342c:0xf2b233),s*.2,.9,.1,g);const sp=glowSprite(0x9ad0ff,1,g,0,1.3,.3,.9);
  g.position.set(x,0,z);g.rotation.y=Math.atan2(-w.dx,-w.dy);world.add(g);inter.push({kind:'wire',x:toW(w.x),z:toW(w.y),wx:x,wz:z,g,sp,used:false,cd:0});}
function addNest(x,z){const g=new THREE.Group();mkMesh(Co(1.4,1.5,7),lam(0x3a2e24,{map:furTex}),0,.75,0,g);const bone=lam(0xcfc2a4);
  for(let i=0;i<9;i++){const a=rand(0,TAU),r=rand(.5,1.1);const b=mkMesh(Cy(.07,.07,rand(.6,1.1),5),bone,Math.sin(a)*r,rand(.2,.9),Math.cos(a)*r,g);b.rotation.set(rand(0,3),rand(0,3),rand(0,3));}
  const core=mkMesh(new THREE.IcosahedronGeometry(.45,0),new THREE.MeshBasicMaterial({color:0xff3a20}),0,1.3,0,g);glowSprite(0xff3a20,2.2,g,0,1.3,0,.6);
  g.position.set(x,0,z);world.add(g);const hp=260*(1+run.tier*.5);
  enemies.push({type:'nest',x,y:0,z,vx:0,vy:0,vz:0,kx:0,kz:0,hp,maxHp:hp,r:1.3,h:1.8,heavy:true,mesh:g,core,spawnT:rand(1,4),col:0x3a2e24,blood:0x5a1a10,flash:0,slow:0,bar:true,pT:0,bT:0,dT:0,tT:0});run.nests++;}
function addPred(path){const mat=bodyMat();mat.color.set(0xffb070);const mesh=new THREE.Mesh(GEO.brute.body,mat);mesh.add(new THREE.Mesh(GEO.brute.glow,new THREE.MeshBasicMaterial({vertexColors:true})));mesh.scale.setScalar(1.45);mesh.castShadow=true;scene.add(mesh);
  const s=path[0],x=toW(s%GW),z=toW((s/GW)|0),hp=700*(1+run.tier*.6);
  enemies.push({type:'brute',pred:true,mesh,path,pi:0,mode:'patrol',lost:0,x,y:0,z,vx:0,vy:0,vz:0,kx:0,kz:0,hp,maxHp:hp,spd:2.6,dmg:26,r:1.2,h:3,sc:1,col:0x8a5a30,blood:0x9a0c0c,heavy:true,bar:true,flash:0,slow:0,ang:0,pT:0,bT:0,dT:0,tT:0,leap:true});}
function bfsPath(a,b){const d=bfs(b%GW,(b/GW)|0,OPEN);return descend(d,a%GW,(a/GW)|0,400);}
function addZone(type,x,z){const g=new THREE.Group();g.position.set(x,floorY(x,z)+.05,z);world.add(g);const zn={type,x,z,g,t:rand(3,8),mt:rand(20,32)};
  if(type==='vent'){zn.r=3.2;zn.a=rand(0,TAU);zn.up=Math.random()<.35;mkMesh(Cy(1.4,1.4,.1,10),lam(0x3a3e44,{map:metalTex}),0,0,0,g);
    zn.arrow=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:arrowTex,transparent:true,depthWrite:false,color:zn.up?0xc8f0ff:0x9ad0ff}));zn.arrow.rotation.x=-PI2;zn.arrow.position.y=.12;g.add(zn.arrow);}
  if(type==='grav'){zn.r=5.5;zn.low=Math.random()<.5;zn.ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));zn.ring.rotation.x=-PI2;zn.ring.scale.setScalar(zn.r);g.add(zn.ring);
    zn.disc=new THREE.Mesh(discGeo,new THREE.MeshBasicMaterial({transparent:true,opacity:.12,depthWrite:false}));zn.disc.rotation.x=-PI2;zn.disc.scale.setScalar(zn.r);g.add(zn.disc);}
  if(type==='decay'){zn.r=4.5;zn.vx=rand(-1,1);zn.vz=rand(-1,1);zn.tick=0;zn.fog=[];for(let i=0;i<4;i++)zn.fog.push(glowSprite(0x7ab020,rand(4,6),g,rand(-1.5,1.5),rand(.6,1.6),rand(-1.5,1.5),.35));}
  zones.push(zn);return zn;}
function populate(info){
  const{dist,pockets,byDist,metal}=info;const trial=mode==='trial';
  objs=[];plats=[];inter=[];benches=[];chests=[];caches=[];pipes=[];lamps=[];valves=[];exitD=null;zones=[];enemies=[];gems=[];scraps=[];pproj=[];eproj=[];foods=[];
  for(const f of flasks){f.on=false;f.m.visible=false;}
  const crateM=lam(0x7a5838,{map:stoneTex});
  for(const r of rooms){const wa=wallAdj(r);
    for(let i=0;i<2&&wa.length;i++){const w=wa[ri(0,wa.length-1)],[x,z]=wallPos(w,.12);lamps.push({x,z});const g=new THREE.Group();mkMesh(Bx(.3,.5,.3),lam(0x3a3640),0,0,0,g);glowSprite(0xffc070,2.4,g,0,.1,0,.85);g.position.set(x,3.2,z);world.add(g);}
    if(r!==startRoom&&!r.metal&&R()<.6){const bw=wa.filter(w=>w.t===0);if(bw.length){const w=bw[ri(0,bw.length-1)],cx=toW(w.x),cz=toW(w.y);staticBox(cx+w.dx*1.1,cz+w.dy*1.1,1.6,1.6,2.3,crateM);staticBox(cx-w.dx*.6,cz-w.dy*.6,1.5,1.5,1.1,crateM);}}
    if(r!==startRoom){const tl=roomTiles(r);for(let i=0;i<ri(1,2)&&tl.length;i++){const[x,y]=tl[ri(0,tl.length-1)];addObj(['cap','sponge','crate'][ri(0,2)],toW(x)+rr(-1,1),toW(y)+rr(-1,1));}}}
  for(const r of metal){const tl=roomTiles(r);['crate','sponge','cap'].forEach((k,i)=>{if(tl.length){const[x,y]=tl[(i*3)%tl.length];addObj(k,toW(x),toW(y));}});
    const wa=wallAdj(r).filter(w=>w.t===6);if(wa.length){const w=wa[ri(0,wa.length-1)];addCache(toW(w.x+w.dx),WH,toW(w.y+w.dy));addChest(toW(w.x+w.dx)+.5,WH,toW(w.y+w.dy)+.5);}}
  const acid=[];for(let k=0;k<GW*GH;k++)if(grid[k]===4)acid.push(k);shuffleR(acid);let sw=0;
  for(const k of acid){if(sw>=6)break;const x=k%GW,y=(k/GW)|0;for(const[dx,dy]of N4)if(tAt(x+dx,y+dy)===1&&!objs.some(o=>Math.hypot(o.x-toW(x+dx),o.z-toW(y+dy))<6)){const o=addObj('swab',toW(x+dx),toW(y+dy));if(dx){o.w=4.6;o.d=.5;}syncObj(o);sw++;break;}}
  pockets.forEach((cells,i)=>{const[x,y]=cells[0];addCache(toW(x),0,toW(y));if(i%2===0){const[a,b]=cells[3];addChest(toW(a),0,toW(b));}});
  const others=rooms.filter(r=>r!==startRoom);
  shuffleR(others.slice()).slice(0,3).forEach(r=>{const wa=wallAdj(r).filter(w=>w.t===0);if(wa.length){const w=wa[ri(0,wa.length-1)];addChest(toW(w.x+w.dx),WH,toW(w.y+w.dy));}});
  shuffleR(others.slice()).slice(0,2).forEach(r=>{const tl=roomTiles(r);if(tl.length){const[x,y]=tl[ri(0,tl.length-1)];addChest(toW(x),floorY(toW(x),toW(y)),toW(y));}});
  const dead=[];for(let k=0;k<GW*GH;k++){if(grid[k]!==1)continue;const x=k%GW,y=(k/GW)|0;if(N4.filter(([dx,dy])=>OPEN(tAt(x+dx,y+dy))).length===1)dead.push(k);}
  shuffleR(dead).slice(0,3).forEach(k=>addCache(toW(k%GW),0,toW((k/GW)|0)));
  const sw2=wallAdj(startRoom);if(sw2.length){const w=sw2[0];addBench(toW(w.x)-w.dx*.6,toW(w.y)-w.dy*.6,Math.atan2(w.dx,w.dy));}
  [byDist[4],byDist[Math.floor(byDist.length*.6)]].filter(Boolean).forEach(r=>{const wa=wallAdj(r);if(wa.length){const w=wa[ri(0,wa.length-1)];addBench(toW(w.x)-w.dx*.6,toW(w.y)-w.dy*.6,Math.atan2(w.dx,w.dy));}});
  shuffleR(others.filter(r=>r.w>=5&&r.h>=4)).slice(0,4).forEach(addRope);
  for(const r of shuffleR(rooms.slice()).slice(0,5)){const wa=wallAdj(r);if(wa.length)addWire(wa[ri(0,wa.length-1)]);}
  const pr=shuffleR(rooms.slice()).slice(0,6);for(let i=0;i+1<pr.length;i+=2){const a=wallAdj(pr[i]),b=wallAdj(pr[i+1]);if(a.length&&b.length){const p=addPipe(a[ri(0,a.length-1)]),q=addPipe(b[ri(0,b.length-1)]);p.link=q;q.link=p;}}
  if(trial){byDist.slice(0,5).filter((r,i)=>i%2===1||i===4).slice(0,3).forEach((r,i)=>{const tl=roomTiles(r);const[x,y]=tl[Math.floor(tl.length/2)]||[r.cx,r.cy];addValve(toW(x)+1,toW(y)+1,i);});
    const er=byDist[0];addExit(toW(er.cx),toW(er.cy));}
  else{byDist.slice(0,10).filter((_,i)=>i%1===0).slice(0,7).forEach(r=>{const tl=roomTiles(r);if(tl.length){const[x,y]=tl[ri(0,tl.length-1)];addNest(toW(x),toW(y));}});}
  const pathRooms=shuffleR(others.slice());for(let p=0;p<(trial?1:2);p++){const loop=pathRooms.slice(p*3,p*3+3);if(loop.length<3)break;let path=[];
    for(let i=0;i<3;i++){const a=loop[i],b=loop[(i+1)%3];path=path.concat(bfsPath(gi(a.cx,a.cy),gi(b.cx,b.cy)));}if(path.length>4)addPred(path);}
  const open=[];for(let k=0;k<GW*GH;k++)if(grid[k]===1&&dist[k]>4)open.push(k);shuffleR(open);let oi=0;const nxt=()=>{const k=open[oi++%open.length];return[toW(k%GW)+rr(-1,1),toW((k/GW)|0)+rr(-1,1)];};
  if(run.mods.includes('currents'))for(let i=0;i<9;i++)addZone('vent',...nxt());
  if(run.mods.includes('gravity'))for(let i=0;i<5;i++)addZone('grav',...nxt());
  if(run.mods.includes('decay'))for(let i=0;i<5;i++)addZone('decay',...nxt());
  if(run.mods.includes('blackout')){hemi.intensity=.35;scene.fog=new THREE.Fog(0x080608,6,30);lantern.intensity=3.4;lantern.distance=18;}else{hemi.intensity=1.25;scene.fog=new THREE.Fog(0x14100e,26,60);lantern.intensity=1.8;lantern.distance=12;}
  scene.background=new THREE.Color(0x0e0b0a);}
function addValve(x,z,i){const g=new THREE.Group();mkMesh(Cy(.18,.18,1.4,6),lam(0x5a6068,{map:metalTex}),0,.7,0,g);const wh=mkMesh(new THREE.TorusGeometry(.55,.1,5,12),lam(0xd8342c),0,1.45,0,g);
  const gl=glowSprite(0xff4a2a,2.2,g,0,1.45,0,.6);g.position.set(x,floorY(x,z),z);world.add(g);valves.push({x,z,g,wh,gl,done:false,i});}
function addExit(x,z){const g=new THREE.Group();const fr=mkMesh(new THREE.TorusGeometry(1.6,.28,6,20),lam(0x3a3640,{map:metalTex}),0,.05,0,g);fr.rotation.x=PI2;
  mkMesh(new THREE.CircleGeometry(1.45,20),new THREE.MeshBasicMaterial({color:0x050304}),0,.04,0,g).rotation.x=-PI2;
  const beam=new THREE.Mesh(Cy(1.5,1.5,16,14,1,true),new THREE.MeshBasicMaterial({color:0xff4a2a,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide,fog:false}));beam.position.y=8;g.add(beam);
  g.position.set(x,0,z);world.add(g);exitD={x,z,g,beam};}

// ---------- collision ----------
const WALLTOP={y:WH},GROUND={ground:true};
function collideBody(b,prevY,R,H,isP){
  b.hw=false;b.blocked=null;let g=null;const cx=toG(b.x),cz=toG(b.z);
  if(b.y<WH-.08)for(let gz=cz-1;gz<=cz+1;gz++)for(let gx=cx-1;gx<=cx+1;gx++){const t=tAt(gx,gz);if(!solidFor(t,isP))continue;
    const x0=(gx-GW/2)*T,x1=x0+T,z0=(gz-GH/2)*T,z1=z0+T,qx=clamp(b.x,x0,x1),qz=clamp(b.z,z0,z1),dx=b.x-qx,dz=b.z-qz,d2=dx*dx+dz*dz;
    if(d2>=R*R)continue;
    if(d2>1e-8){const d=Math.sqrt(d2);b.x+=dx/d*(R-d);b.z+=dz/d*(R-d);}else{const l=b.x-x0,r=x1-b.x,u=b.z-z0,o=z1-b.z,m=Math.min(l,r,u,o);if(m===l)b.x=x0-R;else if(m===r)b.x=x1+R;else if(m===u)b.z=z0-R;else b.z=z1+R;}
    b.hw=true;b.wt=t;b.blocked=WALLTOP;}
  for(const p of plats){if(p===b||p.carried)continue;const hw=p.w/2+R,hd=p.d/2+R,lx=b.x-p.x,lz=b.z-p.z;if(lx>hw||lx<-hw||lz>hd||lz<-hd)continue;const top=p.y,bot=p.y-p.th;
    if(b.vy<=0&&prevY>=top-.1&&b.y<=top+.001){b.y=top;b.vy=0;g=p;}
    else if(b.vy>0&&prevY+H<=bot+.05&&b.y+H>bot){b.y=bot-H;b.vy=0;}
    else if(b.y<top-.1&&b.y+H>bot){if(top-b.y<.45&&b.vy<=0){b.y=top;b.vy=0;g=p;continue;}b.blocked=p;if(hw-Math.abs(lx)<hd-Math.abs(lz))b.x=p.x+Math.sign(lx||1)*hw;else b.z=p.z+Math.sign(lz||1)*hd;}}
  const gy=floorY(b.x,b.z,isP);
  if(b.y<=gy+.001&&b.vy<=0&&gy-b.y<=1.05){if(!g||gy>=g.y){b.y=gy;b.vy=0;g=gy>=WH-.01?WALLTOP:GROUND;}}
  b.x=clamp(b.x,-HALF+1,HALF-1);b.z=clamp(b.z,-HALF+1,HALF-1);return g;}

// ---------- player ----------
const keys={};
function camBasis(){return{fx:Math.sin(camYaw),fz:Math.cos(camYaw),rx:-Math.cos(camYaw),rz:Math.sin(camYaw)};}
function stepPlayer(dt){
  const{fx:f1,fz,rx,rz}=camBasis(),ix=(keys.KeyD?1:0)-(keys.KeyA?1:0),iz=(keys.KeyW?1:0)-(keys.KeyS?1:0);
  let wx=f1*iz+rx*ix,wz=fz*iz+rz*ix;const L=Math.hypot(wx,wz);if(L){wx/=L;wz/=L;P.wx=wx;P.wz=wz;}
  const t=tileAt(P.x,P.z),wet=(t===2||t===4)&&P.y<-.4;
  P.squeeze=!!(keys.KeyC||keys.ControlLeft)&&P.onGround&&!P.carry;
  if(tileAt(P.x,P.z)===5&&P.y<WH-.1)P.squeeze=true;
  P.sprinting=(keys.ShiftLeft||keys.ShiftRight)&&L>0&&run.sta>1&&!P.squeeze&&!P.carry;
  let spd=st.speed*(P.sprinting?st.sprintMul:1)*(wet?.62:1)*(P.squeeze?.55:1)*(P.carry?1-P.carry.mass:1)*(P.gmul>1.2?.85:1);
  if(P.sprinting){run.sta-=st.sprintDrain*dt;P.staT=.6;}
  if(P.lock>0)P.lock-=dt;else{const a=1-Math.exp(-(P.onGround?16:7)*dt);P.vx+=(wx*spd-P.vx)*a;P.vz+=(wz*spd-P.vz)*a;}
  const face=P.aimT>0?P.aim:L?Math.atan2(wx,wz):null;if(face!=null)P.facing+=angD(face,P.facing)*(1-Math.exp(-16*dt));
  P.buffer-=dt;P.coyote-=dt;P.wallT-=dt;
  const canClimb=P.wallT>0&&(P.wallType!==6||st.metalClimb)&&!P.carry&&P.y<WH+.3;
  P.climbing=false;
  if(keys.Space&&canClimb&&run.sta>1&&!P.onGround){P.vy=Math.max(P.vy,6.5);run.sta-=st.climbCost*dt;P.staT=.6;P.climbing=true;P.jumping=false;}
  if(P.buffer>0&&!P.squeeze){const j=v=>{P.vy=v;P.onGround=false;P.coyote=0;P.buffer=0;P.cut=false;P.jumping=true;};
    if(P.onGround||P.coyote>0){j(12.5*(P.gmul<.6?1.05:1));puff(P.x,P.y,P.z,0x9a8a7a,4,1.5);}else if(P.air>0&&!canClimb){P.air--;j(11.5);spark(P.x,P.y+.2,P.z,1.2,0xc080ff);}}
  if(!keys.Space&&P.vy>0&&!P.cut&&P.jumping){P.vy*=.5;P.cut=true;}
  if(!P.climbing)P.vy-=G*P.gmul*dt;
  if(st.glide&&keys.Space&&P.vy<-2.2&&!P.onGround&&!P.climbing)P.vy=-2.2;
  P.vy=Math.max(P.vy,-30);
  const py=P.y;P.fallV=-P.vy;P.x+=P.vx*dt;P.y+=P.vy*dt;P.z+=P.vz*dt;
  const g=collideBody(P,py,P.squeeze?.2:.3,P.squeeze?.45:.9,true),was=P.onGround;P.onGround=!!g;
  if(P.hw&&L){P.wallT=.12;P.wallType=P.wt;}
  if(g){P.coyote=.1;P.air=st.jumps;P.jumping=false;
    if(!was){puff(P.x,P.y,P.z,0x9a8a7a,P.fallV>12?10:4,1.6);if(P.slam){P.slam=false;P.lock=0;const R=4.2*st.area;aoe(P.x,P.y,P.z,R,60,12,'special',0,true);boom(P.x,P.y+.5,P.z,R*1.6,0xff9a5a);fx('ring',P.x,P.y,P.z,R,0xff6a3a,.45);shake=.6;puff(P.x,P.y+.2,P.z,0x9a8a7a,20,5);}}}
  if(!P.sprinting&&!P.climbing){P.staT-=dt;if(P.staT<=0)run.sta=Math.min(st.staMax,run.sta+st.staRegen*dt);}
  run.sta=Math.max(0,run.sta);}
function primary(dt){
  run.primT-=dt;if(run.primT>0||P.squeeze||P.chewing)return;const PR=PRIM[CLASSES[run.cls].prim];
  const ax=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),az=(keys.ArrowUp?1:0)-(keys.ArrowDown?1:0);let dx,dz,t=null;
  if(ax||az){const{fx:a,fz:b,rx,rz}=camBasis();dx=a*az+rx*ax;dz=b*az+rz*ax;const L=Math.hypot(dx,dz);dx/=L;dz/=L;}
  else{t=nearest(PR.range*(PR.range>6?st.range:1));if(!t)return;dx=t.x-P.x;dz=t.z-P.z;const L=Math.hypot(dx,dz)||1;dx/=L;dz/=L;}
  PR.fire(dx,dz,t);run.primT=PR.cd*st.cd*st.tear;P.aim=Math.atan2(dx,dz);P.aimT=.35;}

// ---------- rat ----------
let rat=null;
function makeRat(C){
  const g=new THREE.Group(),L=(c,o={})=>new THREE.MeshLambertMaterial({color:c,flatShading:true,...o});
  const fur=L(C.fur,{map:furTex}),furD=L(new THREE.Color(C.fur).multiplyScalar(.62).getHex(),{map:furTex}),spk=L(C.spike),skin=L(0xb0786c),claw=L(0x1a1616),tooth=L(0xf0e8d8),gear=L(C.gear,{map:stoneTex}),metal=L(0x8a8690,{map:stoneTex});
  const eyeM=new THREE.MeshBasicMaterial({color:C.eye}),mouthM=new THREE.MeshBasicMaterial({color:0x6a0e0e});
  const add=(geo,mat,x,y,z,par=g,r,s)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(r)m.rotation.set(...r);if(s)m.scale.set(...s);m.castShadow=true;par.add(m);return m;};
  const body=new THREE.Group();body.position.y=.52;g.add(body);
  add(Sp(.45,9,7),fur,0,0,0,body,null,[.78,.72,1.5]);add(Sp(.34,8,6),furD,0,-.1,.3,body,null,[.8,.7,1]);
  for(let i=0;i<8;i++)add(Co(.075-i*.004,.44-i*.02,4),spk,0,.28-i*.012,.42-i*.16,body,[-1.05,0,0]);
  for(const s of[-1,1])for(let i=0;i<4;i++)add(Co(.05,.26,4),spk,s*.17,.22,.36-i*.2,body,[-1,0,s*.55]);
  const head=new THREE.Group();head.position.set(0,.78,.66);g.add(head);
  add(Sp(.27,8,6),fur,0,0,0,head,null,[.92,.82,1.1]);add(Co(.16,.52,6),fur,0,-.03,.4,head,[PI2,0,0]);add(Sp(.05,5,4),L(0x2a1a1a),0,-.03,.67,head);
  const jaw=new THREE.Group();jaw.position.set(0,-.13,.12);jaw.rotation.x=.28;head.add(jaw);add(Bx(.17,.06,.4),furD,0,-.03,.2,jaw);
  add(Bx(.14,.05,.34),mouthM,0,-.09,.27,head);
  for(const s of[-1,1]){add(Co(.028,.15,3),tooth,s*.055,-.14,.52,head,[Math.PI,0,0]);add(Co(.022,.1,3),tooth,s*.05,.03,.34,jaw);
    add(Sp(.055,6,4),eyeM,s*.13,.07,.2,head);add(Co(.04,.17,3),spk,s*.14,.17,.13,head,[-.9,0,s*.4]);add(Cy(.12,.12,.03,8),skin,s*.18,.22,-.06,head,[PI2,0,s*.4]);}
  glowSprite(C.eye,.6,head,0,.08,.3,.75).scale.set(.6,.35,1);
  const legs=[];for(const[x,z]of[[-.24,.42],[.24,.42],[-.26,-.4],[.26,-.4]]){const lg=new THREE.Group();lg.position.set(x,.42,z);g.add(lg);add(Cy(.075,.055,.4,5),furD,0,-.2,0,lg);add(Sp(.08,6,4),furD,0,-.4,.04,lg);for(let k=-1;k<=1;k++)add(Co(.02,.13,3),claw,k*.04,-.42,.14,lg,[PI2,0,0]);legs.push(lg);}
  const tail=[];let par=new THREE.Group();par.position.set(0,.5,-.68);g.add(par);const tA=L(0xb88a78,{map:furTex}),tB=L(0x7a5248,{map:furTex});
  for(let i=0;i<14;i++){const s=new THREE.Group();s.position.z=i?-.17:0;const r=.062-i*.0036;const m=new THREE.Mesh(Cy(r*.85,r,.19,6),i%2?tB:tA);m.rotation.x=PI2;m.position.z=-.085;m.castShadow=true;s.add(m);par.add(s);tail.push(s);par=s;}
  if(C.prim==='rake'){add(Sp(.22,6,4),metal,.28,.22,.35,body,null,[1,.6,1.1]);add(Co(.05,.25,4),metal,.36,.4,.35,body,[0,0,-.5]);add(Co(.05,.25,4),metal,.3,.42,.2,body,[0,0,-.3]);
    for(const i of[0,1]){add(Bx(.17,.15,.22),metal,0,-.33,.05,legs[i]);add(Co(.03,.14,3),metal,0,-.25,.18,legs[i],[PI2,0,0]);}}
  if(C.prim==='blight'){add(Co(.34,.55,8),gear,0,.16,-.08,head,[-.5,0,0]);add(new THREE.SphereGeometry(.5,9,6,0,TAU,0,Math.PI*.5),gear,0,.05,-.1,body,null,[.9,.9,1.4]);
    add(Cy(.01,.01,.35,4),metal,.36,.55,.52);add(Sp(.1,6,4),new THREE.MeshBasicMaterial({color:0xa8e060}),.36,.34,.52);}
  if(C.prim==='stone'){add(new THREE.TorusGeometry(.4,.035,4,14),gear,0,.1,.05,body,[0,PI2,.9]);add(Bx(.26,.28,.16),gear,-.32,.1,-.15,body);add(Co(.2,.2,6),gear,0,.2,-.1,head,[-.2,0,0]);}
  if(C.prim==='hex'){add(Co(.34,.6,8),gear,0,.16,-.08,head,[-.5,0,0]);add(new THREE.SphereGeometry(.5,9,6,0,TAU,0,Math.PI*.5),gear,0,.05,-.1,body,null,[.9,.9,1.4]);
    add(Cy(.03,.035,1.7,5),L(0x2e2218),.42,.85,.35);add(new THREE.OctahedronGeometry(.13,0),new THREE.MeshBasicMaterial({color:0xc890ff}),.42,1.78,.35);glowSprite(0xb46cff,.8,g,.42,1.78,.35,1);}
  return{g,body,head,legs,tail,jaw};}
function setRat(C){if(rat)scene.remove(rat.g);rat=makeRat(C);scene.add(rat.g);}
const blob=new THREE.Mesh(new THREE.CircleGeometry(.45,12),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.4,depthWrite:false}));blob.rotation.x=-PI2;scene.add(blob);
function addRunt(){const r=makeRat(CLASSES[run.cls]);r.g.scale.setScalar(.42);scene.add(r.g);familiars.push({r,x:P.x,z:P.z,y:P.y,t:rand(0,.5),a:0});}
const ghostMat=new THREE.MeshBasicMaterial({color:0x9ad0ff,transparent:true,opacity:.35,depthWrite:false});
function makeGhostRat(cls){const r=makeRat(CLASSES[cls]||CLASSES.brawler);r.g.traverse(o=>{if(o.isMesh)o.material=ghostMat;if(o.isSprite)o.visible=false;});scene.add(r.g);return r;}
const pScene=new THREE.Scene();pScene.add(new THREE.HemisphereLight(0xfff0e0,0x402828,1.5));{const l=new THREE.DirectionalLight(0xffe0c0,2.2);l.position.set(-2,3,4);pScene.add(l);const l2=new THREE.PointLight(0xff5a30,6,6,1);l2.position.set(1.5,1,-1);pScene.add(l2);}
const pCam=new THREE.PerspectiveCamera(30,1.35,.1,20),pRT=new THREE.WebGLRenderTarget(162,120);
function portrait(C,close){const r=makeRat(C);pScene.add(r.g);r.g.rotation.y=-.55;pCam.aspect=close?1:1.35;pCam.updateProjectionMatrix();
  if(close){pCam.position.set(-.55,1.0,1.9);pCam.lookAt(0,.78,.55);}else{pCam.position.set(-1.1,1.4,3.2);pCam.lookAt(0,.62,0);}
  const W=close?120:162,H=120;pRT.setSize(W,H);renderer.setRenderTarget(pRT);renderer.setClearColor(0,0);renderer.clear();renderer.render(pScene,pCam);
  const buf=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(pRT,0,0,W,H,buf);renderer.setRenderTarget(null);renderer.setClearColor(0,1);pScene.remove(r.g);
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const x=cv.getContext('2d'),img=x.createImageData(W,H);
  for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){const s=((H-1-yy)*W+xx)*4,d=(yy*W+xx)*4;for(let c=0;c<3;c++)img.data[d+c]=Math.min(255,Math.pow(buf[s+c]/255,1/2.2)*255);img.data[d+3]=buf[s+3];}
  x.putImageData(img,0,0);return cv.toDataURL();}
const PORT={},FACE={};for(const k in CLASSES){PORT[k]=portrait(CLASSES[k],false);FACE[k]=portrait(CLASSES[k],true);}


// ---------- enemies ----------
const hpMul=()=>(1+run.time/60*.22)*(1+run.tier*.45);
function pickType(){const m=run.time/60,mix={mawling:5,tick:3,ghoul:m>1?2.5:.5,bat:m>.5?2:0,bloat:m>1.5?2:0,brute:m>2.5?.8:0};let tot=0;for(const k in mix)tot+=mix[k];let r=Math.random()*tot;for(const k in mix){r-=mix[k];if(r<=0)return k;}return 'mawling';}
function spawnEnemy(type,x,z,o={}){if(enemies.length>=200)return null;const D=EN[type],el=!!o.elite||Math.random()<.02+run.tier*.02,m=hpMul()*(el?3:1),gy=floorY(x,z);if(gy>=WH)return null;
  const e={type,x,y:D.fly?gy+2.2:gy,z,vx:0,vy:0,vz:0,kx:0,kz:0,hp:D.hp*m,maxHp:D.hp*m,spd:D.spd*rand(.9,1.1),dmg:D.dmg,r:D.r*(el?1.3:1),h:D.h*(el?1.3:1),sc:el?1.3:1,xp:D.xp*(el?4:1),
    fly:D.fly,ranged:D.ranged,leap:D.leap,col:D.col,blood:D.blood,flash:0,slow:0,atk:rand(1,2.5),ph:rand(0,6),ang:0,elite:el,bar:D.bar||el,pT:0,pD:0,bT:0,bD:0,dT:0,tT:0,lunge:0,acid:0};
  enemies.push(e);spark(e.x,e.y+.5,e.z,1.2,0xff3a20);return e;}
function spawnBoss(){const kinds=['maw','brood','tabby'],kind=kinds[run.tier%3],B=BOSSES[kind],D=EN[B.geo],hp=B.hp*(1+.8*run.tier);
  const k=spawnTiles.length?spawnTiles.reduce((a,b)=>flow[a]<flow[b]?a:b):gi(toG(P.x),toG(P.z)),x=toW(k%GW),z=toW((k/GW)|0);
  const mesh=new THREE.Mesh(GEO[B.geo].body,bodyMat());mesh.add(new THREE.Mesh(GEO[B.geo].glow,new THREE.MeshBasicMaterial({vertexColors:true})));mesh.scale.setScalar(B.sc);mesh.castShadow=true;scene.add(mesh);
  boss={type:B.geo,kind,boss:true,heavy:true,x,y:floorY(x,z),z,vx:0,vy:0,vz:0,kx:0,kz:0,hp,maxHp:hp,spd:B.spd,dmg:D.dmg*1.6,r:D.r*B.sc*.75,h:D.h*B.sc,sc:1,col:D.col,blood:D.blood,flash:0,slow:0,mesh,t:2.5,t2:2,t3:5,mode:'chase',ang:0,pT:0,pD:0,bT:0,bD:0,dT:0,tT:0};
  enemies.push(boss);$('bossWrap').style.display='flex';$('bossLabel').textContent=B.name.toUpperCase();banner(B.name,'has come for you');shake=.5;boom(x,1.5,z,6,0xff3a20);}
function bossAI(e,dt){
  const dx=P.x-e.x,dz=P.z-e.z;e.t-=dt;if(e.mode==='chase')e.ang=Math.atan2(dx,dz);
  if(e.kind==='tabby'){
    if(e.mode==='tele'){if(e.t<=0){e.mode='leap';e.t=.65;e.sx=e.x;e.sz=e.z;e.gy=e.y;}return true;}
    if(e.mode==='leap'){const u=Math.min(1,1-e.t/.65);e.x=e.sx+(e.tx-e.sx)*u;e.z=e.sz+(e.tz-e.sz)*u;e.y=e.gy+(e.ty-e.gy)*u+Math.sin(Math.PI*u)*6;
      if(e.t<=0){e.y=e.ty;e.mode='chase';e.t=3.2;shake=.6;fx('ring',e.tx,e.ty,e.tz,4.3,0xff5a20,.4);boom(e.tx,e.ty+.5,e.tz,6,0xffb080);if(Math.hypot(P.x-e.tx,P.z-e.tz)<4.1&&Math.abs(P.y-e.ty)<2)hurtP(28,e);}return true;}
    if(e.t<=0&&!solidFor(tileAt(P.x,P.z),false)){e.mode='tele';e.t=.9;e.tx=P.x;e.tz=P.z;e.ty=floorY(P.x,P.z);fx('ring',e.tx,e.ty,e.tz,4.1,0xff3a20,.9);}
    e.t2-=dt;if(e.t2<=0){e.t2=2.4;for(let k=-3;k<=3;k++){const a=e.ang+k*.18;glob(e.x,e.y+2,e.z,Math.sin(a)*9,0,Math.cos(a)*9,12);}}return false;}
  if(e.kind==='brood'){if(e.t<=0){e.t=3.6;for(let i=0;i<3+run.tier;i++)spawnEnemy('tick',e.x+rand(-2.5,2.5),e.z+rand(-2.5,2.5));}
    e.t2-=dt;if(e.t2<=0){e.t2=3.6;for(let i=0;i<18;i++){const a=i/18*TAU+time;glob(e.x,e.y+1,e.z,Math.sin(a)*6.5,0,Math.cos(a)*6.5,10,0xe8e0d0,true);}}return false;}
  if(e.kind==='maw'){
    if(e.mode==='wind'){if(e.t<=0){e.mode='charge';e.t=.7;}return true;}
    if(e.mode==='charge'){e.x+=Math.sin(e.ang)*18*dt;e.z+=Math.cos(e.ang)*18*dt;const py=e.y;e.vy=0;collideBody(e,py,e.r,e.h,false);if(Math.random()<.5)puff(e.x,e.y+.2,e.z,0x2a2028,1,2);if(e.t<=0||e.hw){e.mode='chase';e.t=3.2;}return true;}
    if(e.t<=0){e.mode='wind';e.t=.7;fx('ring',e.x,e.y,e.z,3.4,0xff3a20,.7);}
    e.t2-=dt;if(e.t2<=0){e.t2=1.7;for(let k=-2;k<=2;k++){const a=e.ang+k*.2;glob(e.x,e.y+1.8,e.z,Math.sin(a)*10,0,Math.cos(a)*10,13);}}
    e.t3-=dt;if(e.t3<=0){e.t3=6;for(let i=0;i<3+run.tier;i++)spawnEnemy('mawling',e.x+rand(-2,2),e.z+rand(-2,2));}return false;}
  return false;}
function flowDir(e){const gx=toG(e.x),gz=toG(e.z);if(!inG(gx,gz))return null;const d=flow[gi(gx,gz)];if(d<=1)return null;let best=null,bd=d;
  for(const[dx,dy]of N8){const X=gx+dx,Y=gz+dy;if(!inG(X,Y))continue;const dd=flow[gi(X,Y)];if(dd<0||dd>=bd)continue;if(dx&&dy&&(!OPEN(tAt(gx+dx,gz))||!OPEN(tAt(gx,gz+dy))))continue;bd=dd;best=[X,Y];}
  if(!best)return null;const vx=toW(best[0])-e.x,vz=toW(best[1])-e.z,l=Math.hypot(vx,vz)||1;return[vx/l,vz/l];}

// ---------- interaction ----------
function useTarget(){
  for(const c of chests)if(!c.open&&Math.hypot(c.x-P.x,c.z-P.z)<1.9&&Math.abs(c.y-P.y)<1.3)return{kind:'chest',o:c,label:'Open chest'};
  for(const b of benches)if(Math.hypot(b.x-P.x,b.z-P.z)<2.4&&P.y<2)return{kind:'bench',o:b,label:'Use workbench'};
  for(const p of pipes)if(Math.hypot(p.x-P.x,p.z-P.z)<1.8&&P.y<1.2)return{kind:'pipe',o:p,label:'Squeeze into pipe'};
  for(const v of valves)if(!v.done&&Math.hypot(v.x-P.x,v.z-P.z)<1.9)return{kind:'valve',o:v,label:'Turn valve'};
  return null;}
function grabTarget(){let b=null,bd=1.2;for(const o of objs){if(o.carried)continue;const d=Math.hypot(o.x-P.x,o.z-P.z)-Math.max(o.w,o.d)/2;if(d<bd&&Math.abs((o.y-o.th)-P.y)<1.3){bd=d;b=o;}}return b;}
function chewTarget(){const f=P.facing;for(const dd of[.9,1.6]){const x=P.x+Math.sin(f)*dd,z=P.z+Math.cos(f)*dd,gx=toG(x),gz=toG(z);if(tAt(gx,gz)===3&&P.y<WH-.5)return{kind:'tile',gx,gz,time:1.2,label:'Gnaw through drywall'};}
  for(const it of inter){if(it.kind==='rope'&&it.used)continue;if(it.kind==='wire'&&it.cd>0)continue;if(Math.hypot(it.x-P.x,it.z-P.z)<1.9&&P.y<2)return{kind:it.kind,it,time:it.kind==='wire'?.6:.8,label:it.kind==='wire'?'Gnaw live wires (it bites back)':'Gnaw the rope — drop the can'};}return null;}
function pressE(){
  if(P.carry){dropCarry();return;}const u=useTarget();if(u){doUse(u);return;}const o=grabTarget();if(o){P.carry=o;o.carried=true;P.chewing=false;return;}
  if(chewTarget()){P.chewing=true;P.chewT=0;}}
function dropCarry(){const o=P.carry;P.carry=null;o.carried=false;const f=P.facing;
  if(o.kind==='swab'){const ax=Math.abs(Math.sin(f))>Math.abs(Math.cos(f));o.w=ax?4.6:.5;o.d=ax?.5:4.6;}
  const half=o.kind==='swab'?2.4:Math.max(o.w,o.d)/2;let placed=false;
  for(let s=.5+half;s>=0;s-=.25){const x=P.x+Math.sin(f)*s,z=P.z+Math.cos(f)*s;if(!objBlocked(o,x,z)){o.x=x;o.z=z;placed=true;break;}}
  if(!placed){o.x=P.x;o.z=P.z;}o.vy=0;syncObj(o);}
function objBlocked(o,x,z){for(const[sx,sz]of[[0,0],[-1,-1],[1,-1],[-1,1],[1,1]]){const px=x+sx*(o.w/2-.1),pz=z+sz*(o.d/2-.1);if(solidFor(tileAt(px,pz),false)&&o.y-o.th<WH-.1)return true;}return false;}
function doUse(u){
  if(u.kind==='chest'){const c=u.o;c.open=true;c.lid.rotation.x=-1.9;boom(c.x,c.y+.8,c.z,2.4,0xffd070);const id=run.pool.length?run.pool.pop():'cheese',I=ITEMS[id];run.items.push(id);I.ap();banner(I.name,I.flav);renderSlots();for(let i=0;i<4;i++)scrapDrop(c.x,c.y,c.z);}
  if(u.kind==='bench')openBench();
  if(u.kind==='pipe'){const p=u.o.link;if(!p)return;state='trans';$('fade').style.opacity=1;setTimeout(()=>{P.x=p.ex;P.z=p.ez;P.y=floorY(p.ex,p.ez,true);P.vx=P.vz=P.vy=0;camPos.set(P.x,P.y+10,P.z+8);if(P.carry){dropCarry();}
    $('fade').style.opacity=0;state='play';last=performance.now();dnum(P.x,P.y+1.6,P.z,'Squeezed through','info');for(const e of enemies)if(e.pred&&e.mode==='hunt'){e.mode='patrol';e.hurt=false;}},240);}
  if(u.kind==='valve'){const v=u.o;v.done=true;v.wh.material.color.set(0x6ad06a);v.gl.material.color.set(0x6ad06a);const t=run.time;run.splits.push(t);
    const gs=ghost&&ghost.data.sp?ghost.data.sp[run.splits.length-1]:null;banner(`Valve ${run.splits.length} / 3`,fmtT(t)+(gs!=null?` (${t-gs<0?'−':'+'}${Math.abs(t-gs).toFixed(1)}s)`:''));
    if(valves.every(v=>v.done)){exitD.beam.material.color.set(0x6ad06a);dnum(P.x,P.y+1.6,P.z,'The drain is open','info');}}}
function doChew(c){
  if(c.kind==='tile'){const k=gi(c.gx,c.gz);grid[k]=1;const m=tileMesh[k];if(m){world.remove(m);delete tileMesh[k];}const x=toW(c.gx),z=toW(c.gz);puff(x,1.5,z,0xc8b894,24,4);boom(x,1.2,z,3,0xe8d8b0);scrapDrop(x,0,z);scrapDrop(x,0,z);flowT=0;dnum(x,2,z,'Shortcut','info');shake=.2;}
  if(c.kind==='rope'){const it=c.it;it.used=true;world.remove(it.post);it.rope.visible=false;it.falling=true;it.vy=0;puff(it.x,1.5,it.z,0x7a5a3a,10,3);}
  if(c.kind==='wire'){const it=c.it;it.cd=15;it.sp.visible=false;const ts=enemies.filter(e=>!e.dead&&Math.hypot(e.x-it.x,e.z-it.z)<8).slice(0,10);
    for(const e of ts)bolt([[it.wx,1.8,it.wz],[e.x,e.y+e.h*.6,e.z]]),hit(e,90,null,0,'trap');boom(it.wx,1.8,it.wz,3,0x9ad0ff);hurtP(6,null,true);shake=.3;}}

// ---------- update ----------
let flowT=0,scentT=0,seenT=0,hudT=0,mapT=0;
function update(dt){
  run.time+=dt;P.inv=Math.max(0,P.inv-dt);P.aimT-=dt;P.atk-=dt;run.specT=Math.max(0,run.specT-dt);
  run.hp=Math.min(st.maxHp,run.hp+st.regen*dt);if(run.hp>st.maxHp*.5)run.lowWarned=false;
  P.gmul=1;
  for(const zn of zones){zn.t-=dt;
    if(zn.type==='vent'){if(zn.t<=0){zn.a=rand(0,TAU);zn.t=rand(5,9);}zn.arrow.rotation.z=zn.up?time*3:zn.a+Math.PI;
      if(Math.random()<.5)puff(zn.x+rand(-1,1),floorY(zn.x,zn.z)+.3,zn.z+rand(-1,1),0xc8e8ff,1,1.2);
      const push=b=>{const d=Math.hypot(b.x-zn.x,b.z-zn.z);if(d>zn.r||b.y>floorY(zn.x,zn.z)+3.5)return;if(zn.up){b.vy=Math.min((b.vy||0)+46*dt,12);}else{b.x+=Math.sin(zn.a)*7*dt;b.z+=Math.cos(zn.a)*7*dt;}};
      push(P);for(const e of enemies)if(!e.heavy)push(e);}
    if(zn.type==='grav'){if(zn.t<=0){zn.low=!zn.low;zn.t=12;}zn.mt-=dt;if(zn.mt<=0&&spawnTiles.length){const k=spawnTiles[randi(0,spawnTiles.length-1)];zn.x=toW(k%GW);zn.z=toW((k/GW)|0);zn.g.position.set(zn.x,floorY(zn.x,zn.z)+.05,zn.z);zn.mt=30;}
      const c=zn.low?0x9ad0ff:0xc050ff;zn.ring.material.color.set(c);zn.disc.material.color.set(c);zn.ring.material.opacity=.4+.25*Math.sin(time*4);
      if(Math.random()<.4){const a=rand(0,TAU),r=rand(0,zn.r);parts.push({x:zn.x+Math.sin(a)*r,y:floorY(zn.x,zn.z)+(zn.low?.2:3),z:zn.z+Math.cos(a)*r,vx:0,vy:zn.low?3:-4,vz:0,life:.7,c,s:1,ng:true});}
      if(Math.hypot(P.x-zn.x,P.z-zn.z)<zn.r)P.gmul=zn.low?.35:1.9;}
    if(zn.type==='decay'){const nx=zn.x+zn.vx*dt*1.3,nz=zn.z+zn.vz*dt*1.3;if(OPEN(tileAt(nx,nz))){zn.x=nx;zn.z=nz;}else{zn.vx*=-1;zn.vz*=-1;}if(Math.random()<.01){zn.vx=rand(-1,1);zn.vz=rand(-1,1);}
      zn.g.position.set(zn.x,floorY(zn.x,zn.z)+.05,zn.z);zn.fog.forEach((f,i)=>{f.material.opacity=.25+.1*Math.sin(time*2+i);});zn.tick-=dt;
      if(zn.tick<=0){zn.tick=.5;if(Math.hypot(P.x-zn.x,P.z-zn.z)<zn.r)hurtP(4,null,true);for(const e of enemies)if(!e.dead&&!e.heavy&&Math.hypot(e.x-zn.x,e.z-zn.z)<zn.r){e.hp-=7;e.pT=Math.max(e.pT,.6);if(e.hp<=0)kill(e);}}}}
  stepPlayer(dt/2);stepPlayer(dt/2);primary(dt);
  const tp=tileAt(P.x,P.z);if(tp===4&&P.y<-.5){P.acidT-=dt;if(P.acidT<=0){P.acidT=.5;hurtP(5,null,true);puff(P.x,P.y+.5,P.z,0xb8f040,4,1.5);}}
  if(P.y<-3){P.x=toW(startRoom.cx);P.z=toW(startRoom.cy);P.y=0;}
  auraG.visible=false;orbN=0;
  for(const w of run.weapons){const W=WEAP[w.id];if(W.tick)W.tick(w,dt);
    if(w.id==='aura'){const R=auraR(w);auraG.visible=true;auraG.position.set(P.x,P.y+.05,P.z);auraG.scale.setScalar(R*(1+Math.sin(time*4)*.03));}
    if(W.fire&&!P.squeeze){w.t-=dt;if(w.t<=0)w.t=W.fire(w)===false?.15:W.cd(w)*st.cd;}}
  for(let i=orbN;i<orbs.length;i++)orbs[i].visible=false;
  familiars.forEach((f,i)=>{const a=P.facing+(i%2?.8:-.8),bx=P.x-Math.sin(a)*1.3,bz=P.z-Math.cos(a)*1.3;f.x+=(bx-f.x)*Math.min(1,5*dt);f.z+=(bz-f.z)*Math.min(1,5*dt);f.y+=(P.y-f.y)*Math.min(1,6*dt);
    f.t-=dt;const t=nearest(10);if(t){f.a=Math.atan2(t.x-f.x,t.z-f.z);if(f.t<=0){f.t=.75*st.tear;shoot(f.x,f.y+.4,f.z,t.x-f.x,t.y+t.h/2-(f.y+.4),t.z-f.z,18,5,0,'runt',{col:0xffd070});}}
    f.r.g.position.set(f.x,f.y+Math.abs(Math.sin(time*12+i))*.05,f.z);f.r.g.rotation.y=t?f.a:P.facing;});
  if(P.carry){const o=P.carry,f=P.facing,half=o.kind==='swab'?2.4:Math.max(OBJ[o.kind].w,OBJ[o.kind].d)/2;o.x=P.x+Math.sin(f)*(.45+half);o.z=P.z+Math.cos(f)*(.45+half);o.y=P.y+.45+o.th;o.mesh.position.set(o.x,o.y-o.th/2,o.z);o.mesh.rotation.y=f;}
  if(P.chewing){const c=keys.KeyE&&chewTarget();if(!c){P.chewing=false;P.chewT=0;}else{P.chewT+=dt*st.chew;if(Math.random()<.35)puff(P.x+Math.sin(P.facing)*.8,P.y+.7,P.z+Math.cos(P.facing)*.8,c.kind==='wire'?0x9ad0ff:0xc8b894,2,2);if(P.chewT>=c.time){doChew(c);P.chewing=false;P.chewT=0;}}}
  flowT-=dt;if(flowT<=0){flowT=.25;const[gx,gz]=nearOpen(toG(P.x),toG(P.z));flow=bfs(gx,gz,OPEN);spawnTiles=[];for(let k=0;k<flow.length;k++)if(flow[k]>=6&&flow[k]<=11)spawnTiles.push(k);}
  const trial=mode==='trial',cap=trial?45:Math.min(170,70+run.time/3);
  run.spawnT-=dt;if(run.spawnT<=0&&spawnTiles.length){const m=run.time/60;run.spawnT=trial?2.2:Math.max(.25,1.3-m*.12);const n=trial?2:1+Math.floor(m*.7);
    for(let i=0;i<n&&enemies.length<cap;i++){const k=spawnTiles[randi(0,spawnTiles.length-1)];spawnEnemy(pickType(),toW(k%GW)+rand(-1.4,1.4),toW((k/GW)|0)+rand(-1.4,1.4));}}
  if(!trial){run.surgeT-=dt;if(run.surgeT<=0&&spawnTiles.length){run.surgeT=60;banner('The horde surges','');for(let i=0;i<20+run.tier*6;i++){const k=spawnTiles[randi(0,spawnTiles.length-1)];spawnEnemy(i%3?'mawling':'tick',toW(k%GW)+rand(-1.4,1.4),toW((k/GW)|0)+rand(-1.4,1.4));}}
    if(run.time>=run.nextBoss&&!boss&&spawnTiles.length){spawnBoss();run.nextBoss+=180;run.tier++;}}
  for(const e of enemies){
    if(e.dead)continue;e.flash-=dt;e.slow-=dt;e.tT-=dt;e.lunge-=dt;
    if(e.pT>0||e.bT>0){e.dT-=dt;if(e.dT<=0){e.dT=.5;let d=(e.pT>0?e.pD||3:0)*.5+(e.bT>0?e.bD:0)*.5;d=Math.max(1,Math.round(d));e.hp-=d;run.dmgBy.dot=(run.dmgBy.dot||0)+d;run.dmg+=d;dnum(e.x,e.y+e.h+.2,e.z,d,e.bT>0?'burn':'poison');if(e.hp<=0){kill(e);continue;}}e.pT-=dt;e.bT-=dt;}
    if(e.type==='nest'){e.core.scale.setScalar(1+Math.sin(time*5+e.x)*.15+(e.flash>0?.4:0));e.spawnT-=dt;
      if(e.spawnT<=0&&Math.hypot(e.x-P.x,e.z-P.z)<45){e.spawnT=Math.max(1.6,3.4-run.time/150);if(enemies.length<cap+20){const a=rand(0,TAU);spawnEnemy(pickType(),e.x+Math.sin(a)*2,e.z+Math.cos(a)*2);}}continue;}
    const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;let custom=e.boss&&bossAI(e,dt);
    if(e.pred&&!custom){const det=P.squeeze?3.5:P.sprinting?12:8.5;
      if(e.mode==='patrol'){if((d<det&&Math.abs(P.y-e.y)<3)||e.hurt){e.mode='hunt';e.lost=0;dnum(e.x,e.y+3.4,e.z,'!','crit');}
        else{const k=e.path[e.pi],tx=toW(k%GW),tz=toW((k/GW)|0),vx=tx-e.x,vz=tz-e.z,l=Math.hypot(vx,vz);if(l<.8)e.pi=(e.pi+1)%e.path.length;else{e.x+=vx/l*e.spd*dt;e.z+=vz/l*e.spd*dt;e.ang=Math.atan2(vx,vz);}
          const py=e.y;e.vy-=G*dt;e.y+=e.vy*dt;collideBody(e,py,e.r*.7,e.h,false);custom=true;}}
      else{if(d>18){e.lost+=dt;if(e.lost>4){e.mode='patrol';e.hurt=false;let bi=0,bd=1e9;e.path.forEach((k,i)=>{const q=(toW(k%GW)-e.x)**2+(toW((k/GW)|0)-e.z)**2;if(q<bd){bd=q;bi=i;}});e.pi=bi;}}else e.lost=0;}}
    if(!custom){
      let sp=e.spd*st.foeSpd*(e.slow>0?.5:1)*(e.pred?2:1),dir=flowDir(e),mx,mz;if(dir&&d>3){mx=dir[0];mz=dir[1];}else{mx=dx/d;mz=dz/d;}
      if(e.ranged){if(d<6){mx=-dx/d;mz=-dz/d;sp*=.7;}else if(d<9&&!dir)sp=0;e.atk-=dt;if(e.atk<=0&&d<15){e.atk=2.6;const ty=P.y+.5-(e.y+.7),D=Math.hypot(dx,ty,dz)||1;glob(e.x,e.y+.7,e.z,dx/D*9,ty/D*9,dz/D*9,e.dmg,0x9be06a);e.lunge=.25;}}
      if(e.fly){const w=Math.sin(time*2+e.ph)*.4,ox=mx;mx+=w*mz;mz-=w*ox;}
      e.x+=(mx*sp+e.kx)*dt;e.z+=(mz*sp+e.kz)*dt;e.ang=Math.atan2(e.ranged?dx:mx,e.ranged?dz:mz);
      if(e.fly){e.y+=((Math.max(P.y,floorY(e.x,e.z))+1.2+Math.sin(time*3+e.ph)*.4)-e.y)*Math.min(1,2*dt);e.vy=0;collideBody(e,e.y,e.r,e.h,false);}
      else{const py=e.y;e.vy-=G*dt;e.y+=e.vy*dt;const g=collideBody(e,py,e.r,e.h,false);if(e.leap&&e.hw&&g&&P.y>e.y+.5&&d<7)e.vy=Math.sqrt(2*G*(WH-e.y+.8));}}
    if(zones.length&&e.fly!==true&&!e.heavy){}
    if(tileAt(e.x,e.z)===4&&e.y<-.5&&!e.fly){e.acid-=dt;if(e.acid<=0){e.acid=.5;e.hp-=6;blood(e.x,e.y+.3,e.z,0xb8f040,null,2);if(e.hp<=0){kill(e);continue;}}}
    const k=Math.exp(-7*dt);e.kx*=k;e.kz*=k;
    if(d<e.r+.3&&P.y<e.y+e.h&&P.y+.9>e.y){if(P.inv<=0)e.lunge=.2;hurtP(e.dmg,e);if(st.thorns&&e.tT<=0){e.tT=.5;hit(e,st.thorns,Math.atan2(-dx,-dz),6,'thorns');}}}
  for(let i=0;i<enemies.length;i++){const a=enemies[i];if(a.dead||a.type==='nest')continue;
    for(let j=i+1;j<enemies.length;j++){const b=enemies[j];if(b.dead||b.type==='nest')continue;const dx=b.x-a.x,dz=b.z-a.z,rr=a.r+b.r;if(dx>rr||dx<-rr||dz>rr||dz<-rr)continue;const d2=dx*dx+dz*dz;
      if(d2<rr*rr&&d2>1e-4&&Math.abs(a.y-b.y)<1){const d=Math.sqrt(d2),p=(rr-d)*.5/d,wa=a.heavy?0:b.heavy?1:.5;a.x-=dx*p*2*wa;a.z-=dz*p*2*wa;b.x+=dx*p*2*(1-wa);b.z+=dz*p*2*(1-wa);}}}
  enemies=enemies.filter(e=>!e.dead);
  if(shrapQ.length){const q=shrapQ;shrapQ=[];for(const[x,y,z]of q.slice(0,12)){for(const e of near(x,y,z,2))hit(e,10,Math.atan2(e.x-x,e.z-z),4,'shrapnel',true);spark(x,y+.5,z,1.4,0xffb070);}}
  const solidAt=(x,y,z)=>{const t=tileAt(x,z);if(solidFor(t,false)&&y<WH)return true;return plats.some(p=>!p.carried&&Math.abs(x-p.x)<p.w/2&&Math.abs(z-p.z)<p.d/2&&y<p.y&&y>p.y-p.th);};
  for(const p of pproj){p.life-=dt;
    if(p.homing){let b=null,bd=64;for(const e of enemies){if(e.dead||p.hs.has(e))continue;const d=(e.x-p.x)**2+(e.z-p.z)**2;if(d<bd){bd=d;b=e;}}
      if(b){const dx=b.x-p.x,dy=b.y+b.h*.5-p.y,dz=b.z-p.z,l=Math.hypot(dx,dy,dz)||1,k=Math.min(1,6*dt);p.vx+=(dx/l*p.spd-p.vx)*k;p.vy+=(dy/l*p.spd-p.vy)*k;p.vz+=(dz/l*p.spd-p.vz)*k;}}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(Math.random()<.3)parts.push({x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0,life:.2,c:p.col,s:.6,ng:true});
    if(p.y<floorY(p.x,p.z)-.1||solidAt(p.x,p.y,p.z)){p.life=0;spark(p.x,p.y,p.z,.7,p.col);continue;}
    for(const e of enemies){if(e.dead||p.hs.has(e))continue;const dx=e.x-p.x,dz=e.z-p.z,rr=e.r+.22*p.size;if(dx*dx+dz*dz<rr*rr&&p.y>e.y-.2&&p.y<e.y+e.h+.3){p.hs.add(e);const a=Math.atan2(p.vx,p.vz);hit(e,p.dmg,a,3,p.src,false,p.fx);
      if(p.split){for(const s of[-.7,.7])shoot(p.x,p.y,p.z,Math.sin(a+s),0,Math.cos(a+s),p.spd*.8,p.dmg*.5,0,'primary',{col:p.col,child:true,life:.4});p.split=false;}
      if(p.pierce--<=0){p.life=0;break;}}}}
  pproj=pproj.filter(p=>p.life>0);
  for(const p of eproj){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const dx=P.x-p.x,dy=P.y+.5-p.y,dz=P.z-p.z;if(dx*dx+dy*dy+dz*dz<.45){hurtP(p.dmg);if(p.slow)P.slowT=1.5;p.life=0;spark(p.x,p.y,p.z,1,p.col);}if(solidAt(p.x,p.y,p.z)){p.life=0;spark(p.x,p.y,p.z,.8,p.col);}}
  eproj=eproj.filter(p=>p.life>0);
  for(const b of flasks){if(!b.on)continue;b.t+=dt;const u=Math.min(1,b.t/.6);b.m.position.set(b.sx+(b.tx-b.sx)*u,b.sy+(b.ty-b.sy)*u+Math.sin(Math.PI*u)*3.2,b.sz+(b.tz-b.sz)*u);b.m.rotation.x+=dt*10;
    if(u>=1){b.on=false;b.m.visible=false;aoe(b.tx,b.ty,b.tz,b.R,b.dm,6,b.src,1,b.src==='primary');boom(b.tx,b.ty+.6,b.tz,b.R*1.5,0xa9e06a);fx('disc',b.tx,b.ty,b.tz,b.R,0x6a9a3a,.45,0,.5);decal(b.tx,floorY(b.tx,b.tz)+.01,b.tz,b.R*1.2,0x6a9a3a);}}
  for(const o of objs){if(o.carried)continue;let sup=-10;
    for(const[sx,sz]of[[0,0],[-1,-1],[1,-1],[-1,1],[1,1]]){const px=o.x+sx*(o.w/2-.1),pz=o.z+sz*(o.d/2-.1),t=tileAt(px,pz);sup=Math.max(sup,solidFor(t,false)?(o.y-o.th>=WH-.15?WH:-10):floorY(px,pz,false));}
    for(const p of plats){if(p===o||p.carried)continue;if(Math.abs(p.x-o.x)<(p.w+o.w)/2-.05&&Math.abs(p.z-o.z)<(p.d+o.d)/2-.05&&p.y<=o.y-o.th+.06)sup=Math.max(sup,p.y);}
    const bot=o.y-o.th;if(bot>sup+.001){o.vy-=G*dt;o.y+=o.vy*dt;if(o.y-o.th<=sup){o.y=sup+o.th;if(o.vy<-8)puff(o.x,sup,o.z,0x9a8a7a,6,2);o.vy=0;}syncObj(o);}else if(bot<sup-.001&&sup-bot<.7){o.y=sup+o.th;syncObj(o);}}
  for(const it of inter){if(it.kind==='wire'){if(it.cd>0){it.cd-=dt;if(it.cd<=0)it.sp.visible=true;}else if(Math.random()<.05)spark(it.wx,1.3,it.wz,.6,0x9ad0ff);}
    if(it.kind==='rope'&&it.falling){it.vy-=G*dt;it.can.position.y+=it.vy*dt;const gy=floorY(it.cx,it.cz);if(it.can.position.y<=gy+.5){it.falling=false;world.remove(it.can);
      for(const e of near(it.cx,gy,it.cz,3.2))hit(e,150,Math.atan2(e.x-it.cx,e.z-it.cz),10,'trap');if(Math.hypot(P.x-it.cx,P.z-it.cz)<1.4)hurtP(15,{x:it.cx,z:it.cz});
      boom(it.cx,gy+.8,it.cz,6,0xffd0a0);fx('ring',it.cx,gy,it.cz,3.2,0xffd0a0,.4);shake=.7;puff(it.cx,gy+.4,it.cz,0x9a8a7a,20,5);addObj('can',it.cx,it.cz);}}}
  const mr=st.magnet*st.magnet,pull=(g,dt)=>{const dx=P.x-g.x,dy=P.y+.5-g.y,dz=P.z-g.z,d2=dx*dx+dy*dy+dz*dz;if(!g.pull&&d2<mr)g.pull=true;if(g.pull){g.s=Math.min(30,(g.s||6)+40*dt);const d=Math.sqrt(d2)||1,s=Math.min(d,g.s*dt);g.x+=dx/d*s;g.y+=dy/d*s;g.z+=dz/d*s;}return d2<.36;};
  gems=gems.filter(g=>{if(pull(g,dt)){gainXP(g.v);return false;}return true;});
  scraps=scraps.filter(g=>{if(pull(g,dt)){run.scrap++;return false;}return true;});
  foods=foods.filter(f=>{f.m.position.set(f.x,f.y+.4+Math.sin(time*3)*.1,f.z);f.m.rotation.y+=dt*2;if(Math.hypot(P.x-f.x,P.z-f.z)<1&&Math.abs(P.y-f.y)<1.2){world.remove(f.m);const h=Math.round(st.maxHp*.3);run.hp=Math.min(st.maxHp,run.hp+h);dnum(P.x,P.y+1.6,P.z,'+'+h,'heal');return false;}return true;});
  for(const c of caches){if(c.taken)continue;c.g.rotation.y+=dt;if(Math.hypot(P.x-c.x,P.z-c.z)<1.2&&Math.abs(P.y-c.y)<1.3){c.taken=true;world.remove(c.g);const h=Math.round(st.maxHp*.4);run.hp=Math.min(st.maxHp,run.hp+h);for(let i=0;i<8;i++)scrapDrop(c.x,c.y,c.z);dnum(P.x,P.y+1.6,P.z,'Cheese cache +'+h,'heal');}}
  if(mode==='trial'&&exitD&&valves.every(v=>v.done)&&Math.hypot(P.x-exitD.x,P.z-exitD.z)<1.6&&P.y<.5)finishTrial();
  seenT-=dt;if(seenT<=0){seenT=.2;const gx=toG(P.x),gz=toG(P.z);for(let y=gz-6;y<=gz+6;y++)for(let x=gx-6;x<=gx+6;x++)if(inG(x,y)&&(x-gx)**2+(y-gz)**2<=40)seen[gi(x,y)]=1;}
  if(mode==='trial'){run.recT-=dt;if(run.recT<=0){run.recT=.1;run.rec.push([+run.time.toFixed(2),+P.x.toFixed(2),+P.y.toFixed(2),+P.z.toFixed(2),+P.facing.toFixed(2)]);}}
  if(ghost){const D=ghost.data.d;while(ghost.i<D.length-2&&D[ghost.i+1][0]<=run.time)ghost.i++;const a=D[ghost.i],b=D[Math.min(ghost.i+1,D.length-1)],u=b[0]>a[0]?clamp((run.time-a[0])/(b[0]-a[0]),0,1):0;
    ghost.r.g.visible=run.time<=D[D.length-1][0];ghost.r.g.position.set(a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u,a[3]+(b[3]-a[3])*u);ghost.r.g.rotation.y=a[4]+angD(b[4],a[4])*u;}
  if(P.scent){scentT-=dt;if(scentT<=0){scentT=.4;scentPaths=[];const tgt=(list,col)=>{let b=null,bd=1e9;for(const o of list){const[gx,gz]=nearOpen(toG(o.x),toG(o.z)),d=flow[gi(gx,gz)];if(d>=0&&d<bd){bd=d;b=[gx,gz];}}if(b)scentPaths.push({col,p:descend(flow,b[0],b[1],90)});};
    tgt(caches.filter(c=>!c.taken),0xffe070);tgt(chests.filter(c=>!c.open),0xffa030);tgt(benches,0x4aa3ff);if(mode==='trial'){const v=valves.filter(v=>!v.done);tgt(v.length?v:[exitD],0x6ad06a);}
    for(const e of enemies)if(e.pred)scentPaths.push({col:0xff3a20,p:e.path.filter((_,i)=>i%2===0),loop:true});}}
  if(followCam&&!drag&&time-lastDrag>1.2&&keys.KeyW&&Math.hypot(P.vx,P.vz)>2)camYaw+=angD(Math.atan2(P.vx,P.vz),camYaw)*Math.min(1,1.3*dt);
  if(!drag){const k=Math.min(1,1.5*dt);camOff.x-=camOff.x*k;camOff.z-=camOff.z*k;}}

// ---------- render sync ----------
const barPool=[];for(let i=0;i<16;i++){const d=document.createElement('div');d.className='ebar';d.innerHTML='<i></i>';$('bars').appendChild(d);barPool.push(d);}
function sync(dt){
  const cnt={};for(const k in IMB)cnt[k]=0;
  for(const e of enemies){
    if(e.mesh){if(e.type==='nest')continue;e.mesh.position.set(e.x,e.y,e.z);e.mesh.rotation.y=e.ang;e.mesh.material.emissive.setScalar(e.flash>0?.5:(e.mode==='wind'||e.mode==='tele')?.15+.15*Math.sin(time*30):e.pred&&e.mode==='hunt'?.12:0);continue;}
    const i=cnt[e.type]++;if(i>=160)continue;const lg=e.lunge>0?Math.sin(e.lunge/.2*Math.PI)*.35:0,sq=e.flash>0?.82:1;
    dummy.position.set(e.x+Math.sin(e.ang)*lg,e.y+(e.fly?Math.sin(time*6+e.ph)*.15:Math.abs(Math.sin(time*12+e.ph))*.05),e.z+Math.cos(e.ang)*lg);dummy.rotation.set(0,e.ang,e.fly?Math.sin(time*10+e.ph)*.25:0);
    dummy.scale.set(e.sc/Math.sqrt(sq),e.sc*sq*(e.fly?1:1+Math.sin(time*12+e.ph)*.04),e.sc/Math.sqrt(sq));dummy.updateMatrix();IMB[e.type].setMatrixAt(i,dummy.matrix);IMG[e.type].setMatrixAt(i,dummy.matrix);
    IMB[e.type].setColorAt(i,e.flash>0?tmpC.setScalar(3.5):P.scent?tmpC.setRGB(2.4,.5,.4):e.bT>0?tmpC.setRGB(1.6,.8,.4):e.pT>0?tmpC.setRGB(.7,1.4,.6):e.elite?tmpC.setRGB(1.5,.75,.7):e.slow>0?tmpC.setRGB(.8,.9,1.3):tmpC.setScalar(1));}
  for(const k in IMB){const n=Math.min(160,cnt[k]);IMB[k].count=IMG[k].count=n;IMB[k].instanceMatrix.needsUpdate=IMG[k].instanceMatrix.needsUpdate=true;if(IMB[k].instanceColor)IMB[k].instanceColor.needsUpdate=true;}
  let n=0;for(const g of gems){if(n>=600)break;dummy.position.set(g.x,g.y+.35+Math.sin(time*3+g.ph)*.08,g.z);dummy.rotation.set(0,time*2+g.ph,0);const s=g.v>=10?1.9:g.v>=3?1.35:1;dummy.scale.set(s,s*1.7,s);dummy.updateMatrix();gemIM.setMatrixAt(n++,dummy.matrix);}
  gemIM.count=n;gemIM.instanceMatrix.needsUpdate=true;
  n=0;for(const g of scraps){if(n>=300)break;dummy.position.set(g.x,g.y+.3+Math.sin(time*3+g.ph)*.06,g.z);dummy.rotation.set(PI2*.6,time*2+g.ph,0);dummy.scale.setScalar(1);dummy.updateMatrix();scrapIM.setMatrixAt(n++,dummy.matrix);}
  scrapIM.count=n;scrapIM.instanceMatrix.needsUpdate=true;
  const putP=(im,arr,sz)=>{let n=0;for(const p of arr){if(n>=320)break;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(time*5,time*3,0);dummy.scale.setScalar(sz?p.size||1:1);dummy.updateMatrix();im.setMatrixAt(n,dummy.matrix);im.setColorAt(n,tmpC.setHex(p.col));n++;}im.count=n;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;};
  putP(pprojIM,pproj,true);putP(eprojIM,eproj,false);
  for(const p of parts){p.life-=dt;if(!p.ng)p.vy-=14*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const gy=floorY(p.x,p.z);if(p.y<=gy&&p.vy<0){if(p.b&&Math.random()<.35)decal(p.x,gy,p.z,rand(.35,.8),p.c);p.life=0;}}
  parts=parts.filter(p=>p.life>0);
  n=0;for(const p of parts){if(n>=700)break;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(p.b?p.s:Math.min(1,p.life*2.5)*p.s);dummy.updateMatrix();partIM.setMatrixAt(n,dummy.matrix);partIM.setColorAt(n,tmpC.setHex(p.c));n++;}
  partIM.count=n;partIM.instanceMatrix.needsUpdate=true;if(partIM.instanceColor)partIM.instanceColor.needsUpdate=true;
  for(const f of fxs){if(!f.on)continue;f.life-=dt;const k=1-f.life/f.max;if(f.life<=0){f.on=false;f.g.visible=false;continue;}f.g.scale.setScalar(f.kind==='ring'?f.R*(.25+.75*k):f.R);f.m.material.opacity=f.op*(1-k);}
  for(const f of pfxs){if(!f.on)continue;f.life-=dt;if(f.life<=0){f.on=false;f.obj.visible=false;continue;}const fr=Math.min(3,Math.floor((1-f.life/f.max)*4));f.tex.offset.x=fr*.25;}
  for(const b of bolts){if(!b.on)continue;b.life-=dt;b.l.material.opacity=Math.max(0,b.life/.16);if(b.life<=0){b.on=false;b.l.visible=false;}}
  n=0;if(P.scent&&state==='play')for(const sp of scentPaths){const L=sp.p.length;for(let i=0;i<L&&n<600;i++){const k=sp.p[i],x=toW(k%GW),z=toW((k/GW)|0),w=Math.max(0,Math.sin(i*.8+time*(sp.loop?3:-6)));
    dummy.position.set(x,floorY(x,z)+.45+w*.25,z);dummy.rotation.set(0,time,0);dummy.scale.setScalar(i===L-1&&!sp.loop?2.4:.5+w*.9);dummy.updateMatrix();scentIM.setMatrixAt(n,dummy.matrix);scentIM.setColorAt(n,tmpC.setHex(sp.col));n++;}}
  scentIM.count=n;scentIM.instanceMatrix.needsUpdate=true;if(scentIM.instanceColor)scentIM.instanceColor.needsUpdate=true;
  post.uniforms.scent.value+=((P.scent&&state!=='menu'?1:0)-post.uniforms.scent.value)*Math.min(1,6*dt);
  let bi=0;if(state==='play')for(const e of enemies){if(!e.bar||e.boss||e.dead||bi>=16)continue;if(Math.hypot(e.x-P.x,e.z-P.z)>26)continue;_v.set(e.x,e.y+e.h*(e.pred?1.45:1)+.25,e.z).project(camera);if(_v.z>1)continue;const el=barPool[bi++];el.style.display='block';
    el.style.transform=`translate(${(_v.x*.5+.5)*innerWidth}px,${(-_v.y*.5+.5)*innerHeight}px) translate(-50%,-100%)`;el.firstChild.style.width=Math.max(0,e.hp/e.maxHp*100)+'%';}
  for(;bi<16;bi++)barPool[bi].style.display='none';
  let li=0;const ls=lamps.map(l=>[(l.x-P.x)**2+(l.z-P.z)**2,l]).sort((a,b)=>a[0]-b[0]);lampL.forEach((L,i)=>{const l=ls[i];if(!l||run.mods&&run.mods.includes('blackout')){L.visible=false;return;}L.visible=true;L.position.set(l[1].x,3.2,l[1].z);L.intensity=3.6+Math.sin(time*9+i*3)*.4;});}
function animate(dt){
  if(!rat)return;const mv=Math.hypot(P.vx,P.vz),r01=Math.min(1,mv/5);
  rat.g.position.set(P.x,P.y,P.z);rat.g.rotation.y+=angD(P.facing,rat.g.rotation.y)*(1-Math.exp(-18*dt));
  const at=P.atk>0?Math.sin(P.atk/.22*Math.PI):0,chew=P.chewing?Math.abs(Math.sin(time*22)):0;
  rat.body.position.y=.52+(P.onGround?Math.abs(Math.sin(time*16))*.05*r01:0);rat.body.position.z=at*.18;rat.body.rotation.x=P.climbing?-1.1:P.onGround?.06*r01+at*.15:-.12;
  rat.head.position.y=.78+(P.onGround?Math.sin(time*16)*.025*r01:.04);rat.head.position.z=.66+at*.2;rat.head.rotation.x=P.climbing?-1:chew*.2;rat.jaw.rotation.x=.22+at*.7+chew*.6+(P.carry?.5:0);
  let sx=1,sy=P.onGround?1:clamp(1+P.vy*.012,.88,1.15),sz=1;if(P.squeeze){sy=.55;sx=.72;sz=1.25;}rat.g.scale.set(sx/Math.sqrt(sy),sy,sz/Math.sqrt(sy));
  rat.legs.forEach((l,i)=>{l.rotation.x=P.climbing?Math.sin(time*18+i*1.6)*.9-1:P.onGround?Math.sin(time*16+(i===0||i===3?0:Math.PI))*.7*r01+(i<2?-at*1.4:0):(i<2?-.6:.6);});
  rat.tail.forEach((s,i)=>{s.rotation.y=Math.sin(time*(3+r01*5)-i*.5)*(.1+r01*.08);s.rotation.x=i?.1+(P.onGround?0:.03):.2;});
  rat.g.visible=P.inv>0&&state==='play'?Math.floor(time*24)%2===0:true;
  let gy=floorY(P.x,P.z,true);if(gy>P.y+.05)gy=P.y;for(const p of plats)if(!p.carried&&Math.abs(P.x-p.x)<p.w/2&&Math.abs(P.z-p.z)<p.d/2&&p.y<=P.y+.05&&p.y>gy)gy=p.y;blob.position.set(P.x,gy+.03,P.z);blob.scale.setScalar(clamp(1-(P.y-gy)*.08,.4,1));
  const tgt=_v.set(P.x+camOff.x,P.y+1,P.z+camOff.z);
  const want=new V3(tgt.x-Math.sin(camYaw)*camDist*Math.cos(camPitch),tgt.y+camDist*Math.sin(camPitch),tgt.z-Math.cos(camYaw)*camDist*Math.cos(camPitch));
  camPos.lerp(want,1-Math.exp(-10*dt));camLook.lerp(tgt,1-Math.exp(-14*dt));
  shake=Math.max(0,shake-dt*1.6);camera.position.copy(camPos).add(new V3(rand(-1,1),rand(-1,1),rand(-1,1)).multiplyScalar(shake*.45));camera.lookAt(camLook);
  sun.position.set(P.x+10,P.y+26,P.z+8);sun.target.position.set(P.x,P.y,P.z);lantern.position.set(P.x,P.y+2.4,P.z);
  flash=Math.max(0,flash-dt*3);post.uniforms.hurt.value=flash;post.uniforms.time.value=time;post.uniforms.low.value=state==='play'&&run.hp<st.maxHp*.3?1:0;}


// ---------- input ----------
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='TEXTAREA')return;
  keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();if(e.repeat)return;
  if(state==='play'){if(e.code==='Space')P.buffer=.13;if(e.code==='KeyQ')useSpecial();if(e.code==='KeyE')pressE();if(e.code==='KeyF'){P.scent=!P.scent;scentT=0;}
    if(e.code==='KeyV'){followCam=!followCam;dnum(P.x,P.y+1.6,P.z,followCam?'Follow cam on':'Follow cam off','info');}if(e.code==='KeyM'||e.code==='Tab')openMap();if(e.code==='Escape'||e.code==='KeyP')pause(true);}
  else if(state==='paused'||state==='map'||state==='bench'){if(e.code==='Escape'||e.code==='KeyP'||e.code==='KeyM'||e.code==='Tab'||e.code==='Enter')resume();}
  else if(state==='menu'){const i=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);if(i>=0)startRun(Object.keys(CLASSES)[i]);}
  else if(state==='dead'||state==='done'){if(e.code==='KeyR'||e.code==='Enter')menu();}
  else if(state==='levelup'){const i=['Digit1','Digit2','Digit3'].indexOf(e.code);if(i>=0&&offers[i])choose(offers[i]);}});
addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='KeyE'){P.chewing=false;P.chewT=0;}});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;if(state==='play')pause(true);});
canvas.addEventListener('pointerdown',e=>{drag=e.button===2||e.shiftKey?2:1;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>drag=0);canvas.addEventListener('pointercancel',()=>drag=0);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{if(!drag)return;lastDrag=time;
  if(drag===1){camYaw-=e.movementX*.006;camPitch=clamp(camPitch+e.movementY*.005,.18,1.42);}
  else{const{fx,fz,rx,rz}=camBasis(),k=camDist*.0016;camOff.x+=(-rx*e.movementX+fx*e.movementY)*k;camOff.z+=(-rz*e.movementX+fz*e.movementY)*k;const l=Math.hypot(camOff.x,camOff.z);if(l>12){camOff.x*=12/l;camOff.z*=12/l;}}});
canvas.addEventListener('wheel',e=>{e.preventDefault();camDist=clamp(camDist+e.deltaY*.012,6,28);},{passive:false});
function useSpecial(){if(run.specT>0||P.squeeze)return;const S=SPECIALS[CLASSES[run.cls].special];S.use();run.specT=S.cd*st.specCd*st.cd;}

// ---------- HUD ----------
function renderSlots(){const C=CLASSES[run.cls];
  $('slots').innerHTML=`<div class="slot prim" title="${PRIM[C.prim].name}">${ICON[C.prim]}</div><div class="slot spec" title="Q · ${SPECIALS[C.special].name}">${ICON[C.special]}<i class="cd" id="specCd"></i><em>Q</em></div>`+
    [0,1,2,3].map(i=>{const w=run.weapons[i];return w?`<div class="slot" title="${WEAP[w.id].name}">${ICON[w.id]}<em>${w.lvl}</em></div>`:'<div class="slot empty"></div>';}).join('');
  $('items').innerHTML=run.items.map(id=>`<i style="--c:${hexs(ITEMS[id].col)}" title="${ITEMS[id].name}"></i>`).join('');}
function hud(){
  $('hpFill').style.width=clamp(run.hp/st.maxHp*100,0,100)+'%';$('hpTxt').textContent=Math.ceil(Math.max(0,run.hp))+' / '+st.maxHp;
  $('enFill').style.width=clamp(run.sta/st.staMax*100,0,100)+'%';$('enTxt').textContent=P.climbing?'CLIMBING':P.sprinting?'SPRINTING':P.squeeze?'SQUEEZING':'STAMINA';
  const S=SPECIALS[CLASSES[run.cls].special],cd=$('specCd');if(cd)cd.style.height=(run.specT/(S.cd*st.specCd*st.cd)*100)+'%';
  $('xpFill').style.width=(run.xp/run.need*100)+'%';$('lvlBig').textContent=String(run.level).padStart(2,'0');
  $('res').innerHTML=`<div class="r">${IC_SCRAP}<span>${run.scrap}</span></div>`+run.mods.map(m=>`<span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span>`).join('')+(P.scent?'<span class="chip" style="--cc:#ffe070">Scent vision</span>':'');
  $('dmgTotal').textContent=commas(run.dmg);$('kills').textContent=run.kills;$('clock').textContent=mode==='trial'?fmtT(run.time):fmt(run.time);
  $('obj').textContent=mode==='trial'?(valves.every(v=>v.done)?'Reach the drain':`Turn the valves ${valves.filter(v=>v.done).length}/3 · F to sniff the way`):boss?'Boss awake':`Nests left ${run.nests} · Boss in ${fmt(Math.max(0,run.nextBoss-run.time))}`;
  if(boss)$('bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';
  if(mode==='trial'){const gs=ghost&&ghost.data.sp||[];$('splits').innerHTML=run.splits.map((t,i)=>`Valve ${i+1} ${fmtT(t)}${gs[i]!=null?` <span style="color:${t<gs[i]?'#6ad06a':'#ff7a6a'}">${t<gs[i]?'−':'+'}${Math.abs(t-gs[i]).toFixed(1)}</span>`:''}`).join('<br>')+(ghost?`<br><span style="color:#9ad0ff">Ghost ${fmtT(ghost.data.t)}</span>`:'');}else $('splits').innerHTML='';
  const tip=$('tip');let lab=null,prog=null;
  if(P.carry)lab='E · Drop '+OBJ[P.carry.kind].name;else{const u=useTarget();if(u)lab='E · '+u.label;else{const o=grabTarget();if(o)lab='E · Grab '+OBJ[o.kind].name;else{const c=chewTarget();if(c){lab='Hold E · '+c.label;if(P.chewing)prog=P.chewT/c.time;}
    else{const f=P.facing,t=tileAt(P.x+Math.sin(f)*1.4,P.z+Math.cos(f)*1.4);if(t===5&&!P.squeeze)lab='Hold C · Squeeze through the crevice';}}}}
  if(lab){tip.style.display='flex';tip.innerHTML=`<b>${lab}</b>${prog!=null?`<div class="pb"><i style="width:${prog*100}%"></i></div>`:''}`;}else tip.style.display='none';}
function drawMap(cv,px,radius){const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,cv.width,cv.height);const cx=toG(P.x),cz=toG(P.z),ox=cv.width/2,oy=cv.height/2;
  const col={1:'#5e5866',2:'#2e5a4a',3:'#a89468',4:'#7aa020',5:'#8a5a44'};
  for(let gz=0;gz<GH;gz++)for(let gx=0;gx<GW;gx++){if(radius&&(Math.abs(gx-cx)>radius||Math.abs(gz-cz)>radius))continue;const k=gi(gx,gz);if(!seen[k])continue;const t=grid[k];if(!col[t])continue;x.fillStyle=col[t];x.fillRect(ox+(gx-cx-.5)*px,oy+(gz-cz-.5)*px,px,px);}
  const dot=(o,c,s=4)=>{const gx=toG(o.x),gz=toG(o.z);if(!inG(gx,gz)||!seen[gi(gx,gz)])return;x.fillStyle=c;x.fillRect(ox+(o.x/T+GW/2-.5-cx)*px-s/2,oy+(o.z/T+GH/2-.5-cz)*px-s/2,s,s);};
  benches.forEach(b=>dot(b,'#4aa3ff',6));chests.filter(c=>!c.open).forEach(c=>dot(c,'#ffa030',5));caches.filter(c=>!c.taken).forEach(c=>dot(c,'#ffe070',4));pipes.forEach(p=>dot(p,'#b0b0b8',5));
  enemies.filter(e=>e.type==='nest').forEach(e=>dot(e,'#ff3a20',6));valves.filter(v=>!v.done).forEach(v=>dot(v,'#6ad06a',6));if(exitD)dot(exitD,'#ffffff',7);
  x.save();x.translate(ox+(P.x/T+GW/2-.5-cx)*px,oy+(P.z/T+GH/2-.5-cz)*px);x.rotate(-P.facing+Math.PI);x.fillStyle='#fff';x.beginPath();x.moveTo(0,-6);x.lineTo(4,4);x.lineTo(-4,4);x.fill();x.restore();}
let bannerT;function banner(t,s){const b=$('banner');b.innerHTML=`<b>${t}</b>${s?`<span class="px">${s}</span>`:''}`;b.classList.add('on');clearTimeout(bannerT);bannerT=setTimeout(()=>b.classList.remove('on'),2400);}
const ov=$('overlay');function show(h){ov.innerHTML=h;ov.classList.remove('hide');}function hide(){ov.classList.add('hide');document.activeElement?.blur();}
function resume(){hide();state='play';last=performance.now();if(run.pendingLv>0)openLevelUp();}

// ---------- screens ----------
let friendGhost=null;
function freshStats(C){return{maxHp:C.hp,regen:0,armor:C.armor||0,speed:C.speed,dmg:1,area:C.area||1,cd:C.cd||1,proj:0,magnet:2.6,crit:.05,xp:1,jumps:0,multi:0,range:1,shotSpd:1,tear:1,homing:false,poison:false,burn:false,split:false,shotSize:0,thorns:0,
  staMax:100,staRegen:28,sprintMul:1.45,sprintDrain:22,climbCost:20,metalClimb:false,glide:false,chew:1,specCd:1,taken:1,shrap:false,foeSpd:1,leech:0};}
function setupWorld(seed){for(const e of enemies)if(e.mesh&&e.type!=='nest')scene.remove(e.mesh);boss=null;const info=genMap(seed);run.mods=shuffleR(Object.keys(MODS)).slice(0,2);buildWorld();populate(info);R=Math.random;
  P.x=toW(startRoom.cx);P.z=toW(startRoom.cy);P.y=0;P.vx=P.vy=P.vz=0;camPos.set(P.x,12,P.z+12);flowT=0;}
function menu(){
  state='menu';$('hud').style.display='none';$('bossWrap').style.display='none';familiars.forEach(f=>scene.remove(f.r.g));familiars=[];if(ghost){scene.remove(ghost.r.g);ghost=null;}
  run={cls:'brawler',tier:0,time:0,nests:0,mods:[],level:1,dmgBy:{}};st=freshStats(CLASSES.brawler);mode='survival';setupWorld('MENU');setRat(CLASSES.brawler);camDist=11;camPitch=.55;P.scent=false;
  renderMenu('survival');}
function renderMenu(m){const seed=weekSeed(),lb=JSON.parse(localStorage.getItem('scurry4.lb.'+seed)||'[]'),pb=JSON.parse(localStorage.getItem('scurry4.ghost.'+seed)||'null');
  show(`<div class="panel frame">
    <div class="kick px">A rat roguelike · The Undersewer</div><h1>Scurry</h1>
    <p>An open sewer, crawling with hordes. Gnaw through drywall, squeeze through cracks and pipes, climb brick, stack junk to reach high ledges, and sniff out cheese. Trade salvage at workbenches for risky augments.</p>
    <div class="btns"><button class="btn ${m==='survival'?'on':'ghost'}" id="mS">Survival</button><button class="btn ${m==='trial'?'on':'ghost'}" id="mT">Ghost Trial</button></div>
    ${m==='trial'?`<p>This week's map: <span class="px" style="font-size:13px">${seed}</span>. Turn three valves, then dive down the drain. You race your best ghost, or a friend's if you paste their code.</p>
      <div class="lb">${lb.length?lb.map((r,i)=>`<span>${i+1}</span><span>${CLASSES[r.c]?.name||r.c}</span><span>${fmtT(r.t)}</span>`).join(''):'<span></span><span>No times yet</span><span></span>'}</div>
      <textarea id="fg" placeholder="Paste a friend's ghost code here">${friendGhost?'(friend ghost loaded: '+fmtT(friendGhost.t)+')':''}</textarea>`:'<p>Survive as long as you can. Smash the nests. A boss wakes every three minutes, and each one makes the sewer meaner.</p>'}
    <div class="cards">${Object.entries(CLASSES).map(([k,C],i)=>`<button class="card" data-k="${k}" style="--rc:${C.rc}">
      <div class="row"><span class="key px">${i+1}</span><span class="role">${C.role}</span></div><img class="por" src="${PORT[k]}" alt="">
      <b>${C.name}</b><span class="d">${C.blurb}</span><span class="s">${C.hp} HP · ${PRIM[C.prim].name}<br>Q: ${SPECIALS[C.special].name}</span></button>`).join('')}</div>
    <p class="px" style="font-size:12px">${best.time?`Best survival: ${fmt(best.time)} · ${best.kills} kills`:'No runs yet'}${pb?` · Trial PB ${fmtT(pb.t)}`:''}</p></div>`);
  mode=m;$('mS').onclick=()=>renderMenu('survival');$('mT').onclick=()=>renderMenu('trial');
  const fg=$('fg');if(fg)fg.onchange=()=>{try{const d=JSON.parse(decodeURIComponent(escape(atob(fg.value.trim()))));if(d.s!==seed)throw 0;friendGhost=d;fg.value='(friend ghost loaded: '+fmtT(d.t)+')';}catch(_){fg.value='That code is for a different week or is damaged.';}};
  ov.querySelectorAll('.card').forEach(b=>b.onclick=()=>startRun(b.dataset.k));}
function startRun(k){
  const C=CLASSES[k];familiars.forEach(f=>scene.remove(f.r.g));familiars=[];if(ghost){scene.remove(ghost.r.g);ghost=null;}
  run={cls:k,tier:0,level:1,xp:0,need:need(1),kills:0,dmg:0,scrap:0,time:0,weapons:[],items:[],tomes:{},augs:{},dmgBy:{},pendingLv:0,specT:0,primT:0,lowWarned:false,hp:C.hp,sta:100,nests:0,mods:[],
    nextBoss:180,spawnT:3,surgeT:60,splits:[],rec:[],recT:0,reactor:false,pool:shuffleR(Object.keys(ITEMS).filter(i=>i!=='cheese'))};
  st=freshStats(C);const seed=mode==='trial'?weekSeed():'S'+Date.now();setupWorld(seed);run.seed=seed;setRat(C);
  if(mode==='trial'){const d=friendGhost&&friendGhost.s===seed?friendGhost:JSON.parse(localStorage.getItem('scurry4.ghost.'+seed)||'null');if(d&&d.d&&d.d.length>1)ghost={data:d,i:0,r:makeGhostRat(d.c)};}
  state='play';camYaw=Math.PI;camPitch=.9;camDist=13;camOff.set(0,0,0);P.scent=false;P.carry=null;P.inv=1;
  hide();$('hud').style.display='block';$('clsName').textContent=C.name;$('portrait').src=FACE[k];$('zoneName').textContent=mode==='trial'?'Ghost Trial':'The Undersewer';
  renderSlots();hud();last=performance.now();banner(mode==='trial'?'Ghost Trial':'The Undersewer',run.mods.map(m=>MODS[m].name).join(' · '));}
function pause(on){if(!on){resume();return;}state='paused';
  const W=run.weapons.map(w=>`<span>${WEAP[w.id].name} ${w.lvl}</span>`).join(''),T=Object.keys(run.tomes).map(k=>`<span>${TOMES[k].name.replace('Tome of ','')} ${run.tomes[k]}</span>`).join(''),I=run.items.map(i=>`<span style="border-color:${hexs(ITEMS[i].col)}">${ITEMS[i].name}</span>`).join(''),A=Object.keys(run.augs).map(i=>`<span style="border-color:#4aa3ff">${AUG.find(a=>a.id===i).name}</span>`).join('');
  show(`<div class="panel narrow frame"><div class="kick px">${fmt(run.time)} · Lv ${run.level}</div><h2>Paused</h2>
    ${run.mods.map(m=>`<p><span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span> ${MODS[m].desc}</p>`).join('')}
    ${W?`<div class="tags">${W}</div>`:''}${T?`<div class="tags">${T}</div>`:''}${I?`<div class="tags">${I}</div>`:''}${A?`<div class="tags">${A}</div>`:''}
    <div class="btns"><button class="btn" id="res">Resume</button><button class="btn ghost" id="fc">Follow cam: ${followCam?'on':'off'}</button><button class="btn ghost" id="quit">Abandon run</button></div></div>`);
  $('res').onclick=resume;$('fc').onclick=()=>{followCam=!followCam;pause(true);};$('quit').onclick=()=>{state='play';run.reactor=false;run.hp=0;die();};}
function openMap(){state='map';show(`<div class="panel narrow frame"><div class="kick px">Explored sewer · M to close</div><canvas id="bigmap" width="520" height="520"></canvas>
  <p class="px" style="font-size:11px"><span style="color:#4aa3ff">■</span> workbench <span style="color:#ffa030">■</span> chest <span style="color:#ffe070">■</span> cache <span style="color:#b0b0b8">■</span> pipe <span style="color:#ff3a20">■</span> nest <span style="color:#a89468">■</span> drywall <span style="color:#8a5a44">■</span> crevice <span style="color:#7aa020">■</span> acid</p></div>`);
  drawMap($('bigmap'),13,0);}
function openBench(){state='bench';
  const col=br=>AUG.filter(a=>a.br===br).map(a=>{const own=run.augs[a.id],req=a.req&&!run.augs[a.req],poor=run.scrap<a.cost,off=own||req||poor;
    return`<button class="card ${own?'own':''} ${off&&!own?'off':''}" data-id="${a.id}" style="--rc:${own?'#6ad06a':'#4aa3ff'}"><div class="row"><span class="role">${own?'Installed':req?'Locked':a.cost+' salvage'}</span></div><b>${a.name}</b><span class="up">+ ${a.up}</span><span class="dn">− ${a.dn}</span></button>`;}).join('');
  show(`<div class="panel frame"><div class="kick px">Workbench · ${run.scrap} salvage</div><h2>Augment your rat</h2><p>Every part has a price beyond salvage. Each branch unlocks top to bottom.</p>
    <div class="tree">${['Mobility','Offense','Survival'].map(b=>`<div class="col"><h3>${b}</h3>${col(b)}</div>`).join('')}</div><div class="btns"><button class="btn ghost" id="bx">Leave (Esc)</button></div></div>`);
  ov.querySelectorAll('.card').forEach(b=>b.onclick=()=>{const a=AUG.find(a=>a.id===b.dataset.id);if(run.augs[a.id]||(a.req&&!run.augs[a.req])||run.scrap<a.cost)return;run.scrap-=a.cost;run.augs[a.id]=1;a.ap();banner(a.name,'Installed');openBench();});
  $('bx').onclick=resume;}
let offers=[];
function makeOffers(){const pool=[];
  for(const w of run.weapons)if(w.lvl<5)pool.push({kind:'up',id:w.id,wt:3});
  if(run.weapons.length<4)for(const id in WEAP)if(!run.weapons.some(w=>w.id===id))pool.push({kind:'new',id,wt:2.2});
  for(const id in TOMES)if((run.tomes[id]||0)<(TOMES[id].max||5))pool.push({kind:'tome',id,wt:2});
  const out=[];while(out.length<3&&pool.length){let tot=pool.reduce((a,b)=>a+b.wt,0),r=Math.random()*tot,i=0;for(;i<pool.length;i++){r-=pool[i].wt;if(r<=0)break;}const o=pool.splice(Math.min(i,pool.length-1),1)[0];
    if(o.kind==='tome'&&!TOMES[o.id].flat){const q=Math.random();o.rar=q<.03?3:q<.13?2:q<.4?1:0;}else o.rar=0;out.push(o);}
  if(!out.length)out.push({kind:'heal',rar:0});return out;}
function openLevelUp(){state='levelup';offers=makeOffers();
  show(`<div class="panel frame"><div class="kick px">Level ${run.level}${run.pendingLv>1?` · ${run.pendingLv-1} more to pick`:''}</div><h2>Choose a mutation</h2>
    <div class="cards">${offers.map((o,i)=>{
      if(o.kind==='heal')return`<button class="card" data-i="${i}" style="--rc:#d8342c"><div class="row"><span class="key px">${i+1}</span><span class="role">Heal</span></div><div class="ico">${ICON.heal}</div><b>Stale Cheese</b><span class="d">Restore half your HP.</span></button>`;
      const T=o.kind==='tome'?TOMES[o.id]:null,W=WEAP[o.id],R=RAR[o.rar],lvl=o.kind==='up'?run.weapons.find(w=>w.id===o.id).lvl:0;
      const rc=o.kind==='new'?'#ff6a3a':o.kind==='up'?'#6ad06a':R.c,label=o.kind==='new'?'New weapon · '+W.role:o.kind==='up'?'Level '+(lvl+1):R.n+' tome';
      return`<button class="card" data-i="${i}" style="--rc:${rc}"><div class="row"><span class="key px">${i+1}</span><span class="role">${label}</span></div><div class="ico">${T?ICON.tome:ICON[o.id]}</div>
        <b>${T?T.name:W.name}</b><span class="d">${T?T.d(R.m):o.kind==='new'?W.desc:W.lv[lvl-1]}</span></button>`;}).join('')}</div></div>`);
  ov.querySelectorAll('.card').forEach(b=>b.onclick=()=>choose(offers[+b.dataset.i]));}
function choose(o){
  if(o.kind==='new')run.weapons.push({id:o.id,lvl:1,t:0});else if(o.kind==='up')run.weapons.find(w=>w.id===o.id).lvl++;
  else if(o.kind==='tome'){run.tomes[o.id]=(run.tomes[o.id]||0)+1;TOMES[o.id].ap(RAR[o.rar].m);}else run.hp=Math.min(st.maxHp,run.hp+st.maxHp*.5);
  run.pendingLv--;renderSlots();hud();if(run.pendingLv>0)openLevelUp();else{hide();state='play';last=performance.now();}}
function dmgTable(){const C=CLASSES[run.cls],names={...Object.fromEntries(Object.entries(WEAP).map(([k,w])=>[k,w.name])),primary:PRIM[C.prim].name,special:SPECIALS[C.special].name,dot:'Poison & burn',trap:'Traps',runt:'The Runt',thorns:'Barbed Hide',shrapnel:'Shrapnel'};
  const dmg=Object.entries(run.dmgBy).sort((a,b)=>b[1]-a[1]),mx=dmg.length?dmg[0][1]:1;return`<div class="dbar">${dmg.map(([k,v])=>`<span>${names[k]||k}</span><i style="width:${v/mx*100}%"></i><span style="text-align:right">${commas(v)}</span>`).join('')}</div>`;}
function die(){state='dead';const nb=mode==='survival'&&run.time>best.time;if(nb){Object.assign(best,{time:run.time,kills:run.kills});localStorage.setItem('scurry4.best',JSON.stringify(best));}
  show(`<div class="panel narrow frame"><div class="kick px">${nb?'New best':'Run over'}</div><h1 style="font-size:clamp(64px,9vw,120px)">You died</h1>
    <div class="stat px"><div><b>${fmt(run.time)}</b><span>Survived</span></div><div><b>${run.kills}</b><span>Kills</span></div><div><b>${run.level}</b><span>Level</span></div><div><b>${run.tier}</b><span>Bosses</span></div></div>
    ${dmgTable()}<div class="btns"><button class="btn" id="again">Choose a rat</button><span class="px" style="font-size:12px;color:var(--dim)">or press R</span></div></div>`);$('again').onclick=menu;}
function finishTrial(){state='done';const t=run.time,key='scurry4.ghost.'+run.seed,pb=JSON.parse(localStorage.getItem(key)||'null'),data={s:run.seed,c:run.cls,t:+t.toFixed(2),sp:run.splits.map(x=>+x.toFixed(2)),d:run.rec};
  const newPB=!pb||t<pb.t;if(newPB)try{localStorage.setItem(key,JSON.stringify(data));}catch(_){}
  const lb=JSON.parse(localStorage.getItem('scurry4.lb.'+run.seed)||'[]');lb.push({t,c:run.cls});lb.sort((a,b)=>a.t-b.t);localStorage.setItem('scurry4.lb.'+run.seed,JSON.stringify(lb.slice(0,5)));
  const code=btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  show(`<div class="panel narrow frame"><div class="kick px">${newPB?'New personal best':'Trial complete'}</div><h2>Down the drain</h2>
    <div class="stat px"><div><b>${fmtT(t)}</b><span>Time</span></div>${ghost?`<div><b style="color:${t<ghost.data.t?'#6ad06a':'#ff7a6a'}">${t<ghost.data.t?'−':'+'}${Math.abs(t-ghost.data.t).toFixed(1)}s</b><span>vs ghost</span></div>`:''}<div><b>${run.kills}</b><span>Kills</span></div></div>
    <p>Send this code to a friend. They paste it on the Ghost Trial screen to race your run this week.</p><textarea readonly id="code">${code}</textarea>
    <div class="btns"><button class="btn" id="cp">Copy ghost code</button><button class="btn ghost" id="again">Back to menu</button></div></div>`);
  $('cp').onclick=()=>{const ta=$('code');ta.select();try{navigator.clipboard.writeText(code);}catch(_){document.execCommand('copy');}$('cp').textContent='Copied';};$('again').onclick=menu;}

// ---------- loop ----------
let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
  if(state==='play'){update(dt);hudT-=dt;if(hudT<=0){hudT=.08;hud();}mapT-=dt;if(mapT<=0){mapT=.2;drawMap($('minimap'),4.6,20);}}
  else if(state==='menu'){camYaw+=dt*.12;P.facing+=dt*.4;}
  sync(state==='play'||state==='menu'?dt:0);animate(dt);
  renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCam);}
menu();requestAnimationFrame(loop);

