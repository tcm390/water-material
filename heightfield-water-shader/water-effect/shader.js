import * as THREE from 'three';

const divingRippleVertex = `\             
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  varying vec2 vUv;
  
  void main() {
    vUv = uv;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`;
const divingRippleFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform float uTime;
  uniform float vBroken;
  uniform sampler2D rippleTexture;
  uniform sampler2D noiseMap;
  uniform sampler2D voronoiNoiseTexture;

  varying vec2 vUv;
  
  void main() {
    vec2 mainUv = vec2(
      vUv.x , 
      vUv.y - uTime / 1.
    ); 
    vec4 voronoiNoise = texture2D(
      voronoiNoiseTexture,
      mainUv
    );
    vec2 distortionUv = mix(vUv, mainUv + voronoiNoise.rg, 0.3);
    vec4 ripple = texture2D(
      rippleTexture,
      (distortionUv + mainUv) / 2.
    );
    vec4 noise = texture2D(
      noiseMap,
      (distortionUv + mainUv) / 2.
    );
    if (ripple.a > 0.5) {
      gl_FragColor = ripple;
    }
    else {
      gl_FragColor.a = 0.;
      discard;
    }
    gl_FragColor.a *= 1.5;
    float broken = abs(sin(1.0 - vBroken)) - noise.g;
    if (broken < 0.0001) discard;
    gl_FragColor.rgb *= 0.8;
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`;
const divingLowerSplashVertex = `\      
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  varying float vTextureRotation;

  attribute float textureRotation;
  attribute float broken;
  attribute vec3 positions;
  attribute float scales;
  
  vec3 rotateVecQuat(vec3 position, vec4 q) {
    vec3 v = position.xyz;
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void main() {
    vUv = uv;
    vBroken = broken;
    vTextureRotation = textureRotation;  
    
    vec3 pos = position;
    pos = rotateVecQuat(pos, cameraBillboardQuaternion);
    pos *= scales;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const divingLowerSplashFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D splashTexture;
  uniform sampler2D noiseMap;
  uniform float waterSurfacePos;
  uniform float noiseScale;

  varying vec2 vUv;
  varying vec3 vPos;
  
  varying float vTextureRotation;
  varying float vBroken;
  #define PI 3.1415926
  void main() {
    float mid = 0.5;
    vec2 rotated = vec2(
      cos(vTextureRotation * PI) * (vUv.x - mid) * 1.1 - sin(vTextureRotation * PI) * (vUv.y - mid) * 1.1 + mid,
      cos(vTextureRotation * PI) * (vUv.y - mid) * 1.1 + sin(vTextureRotation * PI) * (vUv.x - mid) * 1.1 + mid
    );
    vec4 splash = texture2D(
      splashTexture,
      rotated
    );
    if (splash.r > 0.1) {
      gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
    }
    if (vPos.y < waterSurfacePos) {
      gl_FragColor.a = 0.;
    }

    float broken = abs(sin(1.0 - vBroken)) - texture2D( noiseMap, rotated * noiseScale ).g;
    if (broken < 0.0001) discard;
    if (gl_FragColor.a > 0.) {
      gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
    }
    else {
      discard;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const divingHigherSplashVertex = `\         
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  
  attribute float broken;
  attribute vec3 positions;
  attribute float scales;
  attribute float rotation;
  
  void main() {
    mat3 rotY = mat3(
      cos(rotation), 0.0, -sin(rotation), 
      0.0, 1.0, 0.0, 
      sin(rotation), 0.0, cos(rotation)
    );
    vUv = uv;
    vBroken = broken;
    vec3 pos = position;
    pos *= scales;
    pos *= rotY;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const divingHigherSplashFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D splashTexture;
  uniform sampler2D noiseMap;
  uniform float waterSurfacePos;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  
  void main() { 
    vec4 splash = texture2D(
      splashTexture,
      vUv
    );
    gl_FragColor = splash;
    if (splash.r < 0.5) {
      discard;
    }
    if (vPos.y < waterSurfacePos) {
      gl_FragColor.a = 0.;
    }

    float broken = abs(sin(1.0 - vBroken)) - texture2D(noiseMap, vUv).g;
    if ( broken < 0.0001 ) discard;
    if (gl_FragColor.a > 0.) {
      gl_FragColor = vec4(0.6, 0.6, 0.6, 1.0);
    }
    else {
      discard;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const bubbleVertex = `\  
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;
  varying vec2 vUv;
  
  varying vec2 vOffset;
  attribute vec3 positions;
  attribute float scales;
  attribute vec2 offset;

  vec3 rotateVecQuat(vec3 position, vec4 q) {
    vec3 v = position.xyz;
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void main() {
    vUv = uv;
    vOffset = offset;

    vec3 pos = position;
    pos = rotateVecQuat(pos, cameraBillboardQuaternion);
    pos *= scales;
    pos += positions;

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const bubbleFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D bubbleTexture1;

  varying vec2 vUv;
  varying vec2 vOffset;

  void main() {
    vec4 bubble = texture2D(
      bubbleTexture1,
      vec2(
        vUv.x / 6. + vOffset.x,
        vUv.y / 5. + vOffset.y
      )
    );
    gl_FragColor = bubble;
    gl_FragColor.rgb *= 5.;
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const dropletRippleVertex = `\
              
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  varying vec2 vUv;
  varying float vBroken;
  varying float vWaveFreq;

  attribute vec3 positions;
  attribute float scales;
  attribute float waveFreq;
  attribute vec4 quaternions;
  attribute float broken;

  vec3 qtransform(vec3 v, vec4 q) { 
    return v + 2.0*cross(cross(v, q.xyz ) + q.w*v, q.xyz);
  }

  void main() {
    vBroken = broken;
    vWaveFreq = waveFreq;
    vUv = uv;
    vec3 pos = position;
    pos = qtransform(pos, quaternions);
    pos *= scales;
    pos += positions;

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const dropletRippleFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform float uTime;
  uniform sampler2D noiseMap;

  varying float vWaveFreq;
  varying float vBroken;
  varying vec2 vUv;
  
  void main() {
    vec2 wavedUv = vec2(
      vUv.x,
      vUv.y + sin(vUv.x * (2. + vWaveFreq) * cos(uTime * 2.)) * 0.05
    );
    float strength = 1.0 - step(0.01, abs(distance(wavedUv, vec2(0.5)) - 0.25));
    gl_FragColor = vec4(vec3(strength), 1.0);
    
    if (gl_FragColor.r < 0.01) {
      discard;
    }
    float broken = abs(sin(1.0 - vBroken)) - texture2D(noiseMap, vUv).g;
    if (broken < 0.0001) discard;
    if (gl_FragColor.a > 0.) {
      gl_FragColor = vec4(0.6, 0.6, 0.6, 1.0);
    }
    else {
        discard;
    }
  ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const movingRippleVertex = `\       
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  varying vec2 vUv;
  varying float vBroken;
  varying float vRand;
  varying float vId;

  attribute float id;
  attribute vec3 positions;
  attribute float scales;
  attribute float random;
  attribute vec4 quaternions;
  attribute float broken;
  attribute float playerRotation;
  
  vec3 qtransform(vec3 v, vec4 q) { 
    return v + 2.0*cross(cross(v, q.xyz ) + q.w*v, q.xyz);
  }
  void main() {
    mat3 rotY =
        mat3(cos(playerRotation), 0.0, -sin(playerRotation), 0.0, 1.0, 0.0, sin(playerRotation), 0.0, cos(playerRotation));   
    vBroken = broken;
    vRand = random;
    vUv = uv;
    vId = id;
    vec3 pos = position;
    pos = qtransform(pos, quaternions);
    pos *= rotY;
    pos *= scales;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const movingRippleFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  varying float vBroken;
  varying float vRand;
  varying vec2 vUv;
  varying float vId;

  uniform float particleCount;
  uniform float uTime;
  uniform float op;
  uniform sampler2D noiseMap;
  uniform sampler2D noiseMap2;
  uniform sampler2D noiseCircleTexture;
  uniform sampler2D splashTexture2;
  uniform sampler2D voronoiNoiseTexture;
  
  // for static ripple
  const float rFrequency = 60.0; 
  const float rSpeed = .2;
  const float rThickness = 0.8;
  const float radiusEnd = .45;
  const float radiusStart = .08;
  const float PI = 3.1415926535897932384626433832795;

  //Noise that moves radially outwards via polar coordinates
  float radialNoise(vec2 uv) { 
    uv.y -= rSpeed * uTime;
    const int octaves = 2;
    const float scale = .09;  
    float power = 2.2;
    float total = 0.1;
    for(int i = 0; i < octaves; i++){
        total += texture2D(noiseMap2, uv * (power * scale)).r * (1.0 / power);
        power *= 20.0;
    }
    return total;
  }

  void main() {
    float mid = 0.5;
    vec2 rotated = vec2(cos(vRand * 2. * PI) * (vUv.x - mid) * 1. - sin(vRand * 2. * PI) * (vUv.y - mid) * 1. + mid,
                cos(vRand * 2. * PI) * (vUv.y - mid) * 1. + sin(vRand * 2. * PI) * (vUv.x - mid) * 1. + mid);
    vec3 noise2 = texture2D(
      noiseMap,
      rotated
    ).rgb;

    // circle ripple
    if (vId < particleCount * 0.5 - 1.0) {
      vec4 noiseCircle = texture2D(
        noiseCircleTexture,
        vUv
      );
      gl_FragColor = noiseCircle;
      if (gl_FragColor.r <= 0.1) {
        discard;
      }
      else {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
      if (vUv.y < 0.4) {
        discard;
      }
      float broken = abs(sin(1.0 - vBroken)) - noise2.g;
      if (broken < 0.0001) discard;   
    }
    // broken ripple
    else if (vId < particleCount - 1.5) {
      vec2 mainUv = vec2(
        vUv.x , 
        vUv.y - uTime / 2.
      ); 
      vec4 voronoiNoise = texture2D(
        voronoiNoiseTexture,
        mainUv
      );
      vec2 distortionUv = mix(rotated, voronoiNoise.rg, 0.0);
      vec4 splash = texture2D(
        splashTexture2,
        distortionUv
      );
      
      gl_FragColor = splash;
      if (gl_FragColor.r <= 0.1) {
        discard;
      }
      else {
        gl_FragColor = voronoiNoise;
        gl_FragColor.rgb *= 3.;
        gl_FragColor.a = 0.5;
      }
      float broken = abs(sin(1.0 - vBroken)) - noise2.g;
      if (broken < 0.0001) discard;
    }
    // static ripple
    else { 
      vec2 uv = vUv;

      vec2 center = vec2(.5, .5);
      vec2 toCenter = uv - center;
      float dist = length(toCenter);

      float distScalar = max(0.0, 1.0 - dist / radiusEnd);
      float ripple = sin((dist - rSpeed * uTime) * rFrequency);
      ripple = max(0.0, ripple);
      ripple = pow(ripple, rThickness);
      ripple = (dist > radiusStart) ? ripple * distScalar : 0.0;
      
      float angle = atan(toCenter.x, toCenter.y);
      angle = (angle + PI) / (2.0 * PI);
      float noise = radialNoise(vec2(angle, dist));
      
      float total = ripple;
      total -= noise;
      total = total < .01 ? 0.0 : 1.0;
      
      gl_FragColor = vec4(total);
      gl_FragColor.a *= pow(distance(center, uv), 3.) * 100.;
      gl_FragColor.a *= op;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const freestyleSplashVertex = `\     
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}

  attribute vec3 scales;

  attribute float rotation;
  attribute vec3 positions;
  attribute float broken;

  varying float vBroken;
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {  
    mat3 rotY = mat3(
      cos(rotation), 0.0, -sin(rotation), 
      0.0, 1.0, 0.0, 
      sin(rotation), 0.0, cos(rotation)
    );
    vBroken = broken;
    vUv = uv;
    vec3 pos = position;
    pos *= 0.006;
    pos *= scales;
    pos *= rotY;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const freestyleSplashFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform float waterSurfacePos;
  uniform sampler2D circleTexture;
  uniform sampler2D noiseMap;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;

  void main() {
    vec4 motion = texture2D(
      circleTexture,
      vUv
    );
    gl_FragColor = motion;
    if (gl_FragColor.r > 0.01) {
      gl_FragColor.rgb *= 1.5;
    }
    float broken = abs(sin(1.0 - vBroken)) - texture2D(noiseMap, vUv).g;
    if (broken < 0.0001) discard;
    if (vPos.y < waterSurfacePos) {
      discard;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const bodyDropVertex = `\       
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  varying float vOpacity;
  varying float vId;
  
  attribute float broken;
  attribute float id;
  attribute float opacity;
  attribute vec3 positions;
  attribute vec3 scales;
  
  vec3 rotateVecQuat(vec3 position, vec4 q) {
    vec3 v = position.xyz;
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void main() {
    vUv = uv;
    vBroken = broken;
    vOpacity = opacity;
    vId = id;
    
    vec3 pos = position;
    pos = rotateVecQuat(pos, cameraBillboardQuaternion);
    pos *= scales;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const bodyDropFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D splashTexture;
  uniform sampler2D noiseMap;
  uniform sampler2D dropTexture;
  uniform float dropCount;
  
  varying vec2 vUv;
  varying vec3 vPos;
  varying float vOpacity;
  varying float vId;
  
  varying float vBroken;
  void main() {
    if (vId < dropCount - 0.5) {
      vec4 drop = texture2D(
        dropTexture,
        vUv
      );
      if (drop.b < 0.5) {
        discard;
      }
      gl_FragColor = vec4(drop.rgb, vOpacity);
    }
    else {
      vec4 splash = texture2D(
        splashTexture,
        vUv
      );
      if (splash.r > 0.2) {
        gl_FragColor = vec4(0.8, 0.8, 0.8, 1.0);
      }
      else {
        discard;
      }
      
      float broken = abs(sin(1.0 - vBroken)) - texture2D(noiseMap, vUv).g;
      if (broken < 0.0001) discard;
    }
    
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
export {
  divingRippleVertex, divingRippleFragment,
  divingLowerSplashVertex, divingLowerSplashFragment,
  divingHigherSplashVertex, divingHigherSplashFragment,
  bubbleVertex, bubbleFragment,
  dropletRippleVertex, dropletRippleFragment,
  movingRippleVertex, movingRippleFragment,
  freestyleSplashVertex, freestyleSplashFragment,
  bodyDropVertex, bodyDropFragment,
};