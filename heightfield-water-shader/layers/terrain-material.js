import * as THREE from 'three';
import metaversefile from 'metaversefile';
import { NUM_TERRAIN_MATERIALS } from './terrain-mesh.js';

const {useAtlasing} = metaversefile;

const {calculateCanvasAtlasTexturePerRow} = useAtlasing();

const _createTerrainMaterial = () => {
  const materialUniforms = {
    // texture atlases
    uDiffMap: {},
    uNormalMap: {},
    uRoughnessMap: {},
    uMetalnessMap: {},
    uAoMap: {},

    // noise texture
    uNoiseTexture: {},
  };

  const texturePerRow = calculateCanvasAtlasTexturePerRow(NUM_TERRAIN_MATERIALS);

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    metalness: 0.1,
    // envMap: new THREE.Texture(),
    envMapIntensity: 1,
    onBeforeCompile: (shader) => {
      for (const k in materialUniforms) {
        shader.uniforms[k] = materialUniforms[k];
      }

      // ? by installing glsl-literal extension in vscode you can get syntax highlighting for glsl
      // vertex shader
      const uvParseVertex = /* glsl */`
        #include <uv_pars_vertex>

        attribute ivec4 materials;
        attribute vec4 materialsWeights;

        flat varying ivec4 vMaterials;
        varying vec4 vMaterialsWeights;

        varying mat3 vNormalMatrix;
        varying vec3 vPosition;
        varying vec3 vObjectNormal;
      `;

      const worldPosVertex = /* glsl */`
       #include <worldpos_vertex>

       vMaterials = materials;
       vMaterialsWeights = materialsWeights;

       vPosition = transformed;
       vNormalMatrix = normalMatrix;
       vObjectNormal = normal;
      `;

      // fragment shader
      const mapParseFragment = /* glsl */`
        #include <map_pars_fragment>

        precision highp sampler2D;
        precision highp float;
        precision highp int;

        flat varying ivec4 vMaterials;
        varying vec4 vMaterialsWeights;

        varying vec3 vPosition;
        varying mat3 vNormalMatrix;
        varying vec3 vObjectNormal;
  
        uniform sampler2D uDiffMap;
        uniform sampler2D uRoughnessMap;
        uniform sampler2D uMetalnessMap;
        uniform sampler2D uNormalMap;
        uniform sampler2D uAoMap;

        uniform sampler2D uNoiseTexture;
  
        const float TEXTURE_SCALE = 40.0;
        const float TEXTURE_PER_ROW = float(${texturePerRow});
        const float TEXTURE_SIZE = 1.0 / TEXTURE_PER_ROW;

        vec4 blendSamples(vec4 samples[4], vec4 weights) {
          float weightSum = weights.x + weights.y + weights.z + weights.w;
          return (samples[0] * weights.x + samples[1] * weights.y + samples[2] * weights.z + samples[3] * weights.w) / weightSum;
        }

        float sum( vec3 v ) { return v.x+v.y+v.z; }

        vec4 hash4(vec2 p) {
          return fract(sin(vec4(1.0 + dot(p, vec2(37.0, 17.0)), 2.0 + dot(p, vec2(11.0, 47.0)), 3.0 + dot(p, vec2(41.0, 29.0)), 4.0 + dot(p, vec2(23.0, 31.0)))) * 103.0);
        }

        #define saturate(a) clamp( a, 0.0, 1.0 )
              
        vec3 ACESFilmicToneMapping(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return saturate((x*(a*x+b))/(x*(c*x+d)+e));
        }

        vec2 getSubTextureOffset(int textureIndex){
          float ax = mod(float(textureIndex), TEXTURE_PER_ROW);
          float ay = floor(float(textureIndex) / TEXTURE_PER_ROW);

          return vec2(ax, ay) * TEXTURE_SIZE;
        }

        // sub texture in atlas
        vec4 subTexture2D(sampler2D textureSample, vec2 tileUv, vec2 textureOffset, vec2 duvdx, vec2 duvdy) {
          vec2 subUv = fract(tileUv) * TEXTURE_SIZE + textureOffset;
          return textureGrad(textureSample, subUv, duvdx, duvdy);
        }

        // * based on this article : https://iquilezles.org/articles/texturerepetition
        vec4 textureNoTile(sampler2D textureSample, int textureIndex, vec2 uv ) {
          // sample variation pattern
          float k = vec3(texture2D(uNoiseTexture, 0.0025*uv)).x; // cheap (cache friendly) lookup

          // compute index
          float l = k*8.0;
          float f = fract(l);

          // suslik's method
          float ia = floor(l+0.5);
          float ib = floor(l);
          f = min(f, 1.0-f)*2.0;

          // offsets for the different virtual patterns
          vec2 offa = vec2(hash4(vec2(30.0,7.0)*ia)); // can replace with any other hash
          vec2 offb = vec2(hash4(vec2(30.0,7.0)*ib)); // can replace with any other hash

          vec2 textureOffset = getSubTextureOffset(textureIndex);

          // compute derivatives for mip-mapping
          vec2 duvdx = dFdx(uv);
          vec2 duvdy = dFdy(uv);

          // sample the two closest virtual patterns
          vec4 cola = subTexture2D(textureSample, uv + offa, textureOffset, duvdx, duvdy);
          vec4 colb = subTexture2D(textureSample, uv + offb, textureOffset, duvdx, duvdy);


          // interpolate between the two virtual patterns
          return mix(cola, colb, smoothstep(0.2,0.8,f-0.1*sum(cola.xyz-colb.xyz)));
        }

        vec4 blendMaterials(sampler2D inputTextures, vec2 uv) {
          vec4 samples[4];

          samples[0] = textureNoTile(inputTextures, vMaterials.x, uv);
          samples[1] = textureNoTile(inputTextures, vMaterials.y, uv);
          samples[2] = textureNoTile(inputTextures, vMaterials.z, uv);
          samples[3] = textureNoTile(inputTextures, vMaterials.w, uv);

          return blendSamples(samples, vMaterialsWeights);
        }

        vec4 mapTextures(vec3 inputPosition, vec3 inputNormal, sampler2D inputTextures){
          vec2 textureUv = inputPosition.xz * (1.f / TEXTURE_SCALE);
          vec4 textureColor = blendMaterials(inputTextures, textureUv);
          return textureColor;
        }
      `;

      const mapFragment = /* glsl */`
        #include <map_fragment>
 
        vec4 diffMapColor = mapTextures(vPosition, vObjectNormal, uDiffMap);
        diffMapColor.rgb = ACESFilmicToneMapping(diffMapColor.rgb);
        diffuseColor *= diffMapColor;
      `;

      const normalFragmentMaps = /* glsl */`
        #include <normal_fragment_maps>

        vec3 normalMapColor = mapTextures(vPosition, vObjectNormal, uNormalMap).xyz;
        normal = normalize(vNormalMatrix * normalMapColor); 
      `;

      // * The maps below are disabled for now
      const roughnessMapFragment = /* glsl */`
        #include <roughnessmap_fragment>

        // vec4 texelRoughness = mapTextures(vPosition, vObjectNormal, uRoughnessMap);
        // roughnessFactor *= texelRoughness.g;
      `;
      const metalnessMapFragment = /* glsl */`
        #include <metalnessmap_fragment>

        // vec4 texelMetalness = mapTextures(vPosition, vObjectNormal, uMetalnessMap);
        // metalnessFactor *= texelMetalness.g;
      `;

      const aoMapFragment = /* glsl */`
        #include <aomap_fragment>

        // vec4 triplanarAoColor = mapTextures(vPosition, vObjectNormal, uAoMap);

        // float ambientOcclusion = triplanarAoColor.r;
        // reflectedLight.indirectDiffuse *= ambientOcclusion;

        // #if defined( USE_ENVMAP ) && defined( STANDARD )
        //   float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
        //   reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        // #endif
      `;

      // extend shaders
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_pars_vertex>',
        uvParseVertex
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        worldPosVertex
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_pars_fragment>',
        mapParseFragment
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        roughnessMapFragment
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        metalnessMapFragment
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        mapFragment
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        normalFragmentMaps
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        aoMapFragment
      );

      return shader;
    },
  });

  material.uniforms = materialUniforms;

  return material;
};

export default _createTerrainMaterial;
