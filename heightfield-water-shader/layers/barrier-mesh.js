import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {bufferSize, WORLD_BASE_HEIGHT, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT} from '../constants.js';

const {useProcGenManager, useGeometryBuffering} = metaversefile;
const {BufferedMesh, GeometryAllocator} = useGeometryBuffering();
const procGenManager = useProcGenManager();

//

const localVector3D = new THREE.Vector3();
const localVector3D2 = new THREE.Vector3();
const localBox = new THREE.Box3();

//

export class BarrierMesh extends BufferedMesh {
  constructor({
    instance,
    gpuTaskManager,
  }) {
    const allocator = new GeometryAllocator(
      [
        {
          name: 'position',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'normal',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'uv',
          Type: Float32Array,
          itemSize: 2,
        },
        {
          name: 'position2D',
          Type: Int32Array,
          itemSize: 2,
        },
      ],
      {
        bufferSize,
        // boundingType: 'box',
        // hasOcclusionCulling: true
      }
    );

    const {geometry} = allocator;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPosition2D: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
      },
      vertexShader: `\
        attribute ivec2 position2D;
        varying vec2 vUv;
        varying vec3 vPosition;
        uniform ivec2 uPosition2D;

        void main() {
          vUv = uv;
          vPosition = position;
          bool matches = uPosition2D.x == position2D.x && uPosition2D.y == position2D.y;
          if (!matches) {
            vPosition = vec3(0.);
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        // varying vec3 vPosition;
        varying vec2 vUv;

        // const vec3 lineColor1 = vec3(${new THREE.Color(0x66bb6a).toArray().join(', ')});
        const vec3 lineColor1 = vec3(${new THREE.Color(0x42a5f5).toArray().join(', ')});
        const vec3 lineColor2 = vec3(${new THREE.Color(0x9575cd).toArray().join(', ')});

        /* float edgeFactor(vec3 bary, float width) {
          vec3 d = fwidth(bary);
          vec3 a3 = smoothstep(d * (width - 0.5), d * (width + 0.5), bary);
          return min(min(a3.x, a3.y), a3.z);
        } */

        vec4 sRGBToLinear( in vec4 value ) {
          return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
        }

        void main() {
          // if (vUv.x > 1.) {
          //   gl_FragColor = vec4(0., 0.0, 0., 1.0);
          // } else {
            // gl_FragColor = vec4(vUv.x, 0.0, vUv.y, 1.0);
          // }

          // vec3 c = mix(lineColor1, lineColor2, vPosition.y / 10.);
          vec3 c = lineColor1;
          // vec3 p = vPosition;
          // float f = min(mod(p.x, 1.), mod(p.z, 1.));
          float f = min(mod(vUv.x, 1.), mod(vUv.y, 1.));
          f = min(f, mod(1.-vUv.x, 1.));
          f = min(f, mod(1.-vUv.y, 1.));
          f *= 10.;
          float a = max(1. - f, 0.);
          if (a < 0.5) {
            discard;
          } else {
            gl_FragColor = vec4(c, a);
            gl_FragColor = sRGBToLinear(gl_FragColor);
          }

          // #include <tonemapping_fragment>
			    // #include <encodings_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,

      clipping: false,
      fog: false,
      lights: false,
    });

    super(geometry, material);

    this.instance = instance;
    this.gpuTaskManager = gpuTaskManager;

    this.allocator = allocator;
    this.gpuTasks = new Map();
    this.geometryBindings = new Map();
  }
  addChunk(chunk, chunkResult) {
    if (chunkResult.barrierGeometry.positions.length > 0) {
      const key = procGenManager.getNodeHash(chunk);
      const task = this.gpuTaskManager.transact(() => {
        const _mapOffsettedIndices = (
          srcIndices,
          dstIndices,
          dstOffset,
          positionOffset
        ) => {
          const positionIndex = positionOffset / 3;
          for (let i = 0; i < srcIndices.length; i++) {
            dstIndices[dstOffset + i] = srcIndices[i] + positionIndex;
          }
        };
        const _renderBarrierMeshDataToGeometry = (
          barrierGeometry,
          geometry,
          geometryBinding
        ) => {
          let positionOffset = geometryBinding.getAttributeOffset('position');
          let normalOffset = geometryBinding.getAttributeOffset('normal');
          let uvOffset = geometryBinding.getAttributeOffset('uv');
          let position2DOffset = geometryBinding.getAttributeOffset('position2D');
          let indexOffset = geometryBinding.getIndexOffset();

          _mapOffsettedIndices(
            barrierGeometry.indices,
            geometry.index.array,
            indexOffset,
            positionOffset
          );

          geometry.attributes.position.update(
            positionOffset,
            barrierGeometry.positions.length,
            barrierGeometry.positions,
            0
          );
          geometry.attributes.normal.update(
            normalOffset,
            barrierGeometry.normals.length,
            barrierGeometry.normals,
            0
          );
          geometry.attributes.uv.update(
            uvOffset,
            barrierGeometry.uvs.length,
            barrierGeometry.uvs,
            0
          );
          geometry.attributes.position2D.update(
            position2DOffset,
            barrierGeometry.positions2D.length,
            barrierGeometry.positions2D,
            0
          );
          geometry.index.update(indexOffset, barrierGeometry.indices.length);
        };
        const _handleBarrierMesh = barrierGeometry => {
          const {chunkSize} = this.instance;

          const boundingBox = localBox.set(
            localVector3D.set(
              chunk.min.x * chunkSize,
              -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
              chunk.min.y * chunkSize
            ),
            localVector3D2.set(
              (chunk.min.x + chunk.lod) * chunkSize,
              -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
              (chunk.min.y + chunk.lod) * chunkSize
            )
          );

          const geometryBinding = this.allocator.alloc(
            barrierGeometry.positions.length,
            barrierGeometry.indices.length,
            boundingBox,
            // min,
            // max,
            // this.appMatrix,
            // barrierGeometry.peeks
          );
          // console.log(localVector3D);
          _renderBarrierMeshDataToGeometry(
            barrierGeometry,
            this.allocator.geometry,
            geometryBinding
          );

          this.geometryBindings.set(key, geometryBinding);
        };
        _handleBarrierMesh(chunkResult.barrierGeometry);

        /* const _handlePhysics = async () => {
          if (geometryBuffer) {
            this.matrixWorld.decompose(localVector, localQuaternion, localVector2);
            const physicsObject = this.physics.addCookedGeometry(
              geometryBuffer,
              localVector,
              localQuaternion,
              localVector2
            );
            this.physicsObjects.push(physicsObject);
            this.physicsObjectToChunkMap.set(physicsObject, chunk);

            const onchunkremove = () => {
              this.physics.removeGeometry(physicsObject);

              const index = this.physicsObjects.indexOf(physicsObject);
              this.physicsObjects.splice(index, 1);
              this.physicsObjectToChunkMap.delete(physicsObject);

              tracker.offChunkRemove(chunk, onchunkremove);
            };
            tracker.onChunkRemove(chunk, onchunkremove);
          }
        };
        _handlePhysics(); */
      });
      this.gpuTasks.set(key, task);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);

    {
      const geometryBinding = this.geometryBindings.get(key);
      if (geometryBinding) {
        this.allocator.free(geometryBinding);
        this.geometryBindings.delete(key);
      }
    }
    {
      const task = this.gpuTasks.get(key);
      if (task) {
        task.cancel();
        this.gpuTasks.delete(key);
      }
    }
  }
  updateChunk(currentCoord) {
    this.material.uniforms.uPosition2D.value.fromArray(currentCoord);
    this.material.uniforms.uPosition2D.needsUpdate = true;
  }
}