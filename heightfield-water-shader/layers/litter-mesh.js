import * as THREE from 'three';
import {PolygonPackage, PolygonMesh} from '../meshes/polygon-mesh.js';
import {SpritesheetPackage, SpritesheetMesh} from '../meshes/spritesheet-mesh.js';
import {glbUrlSpecs} from '../assets.js';

//

export const litterUrls = glbUrlSpecs.trees.slice(0, 1)
  .concat(glbUrlSpecs.ores.slice(0, 1));

//

const spriteLodCutoff = 16;
const meshLodSpecs = {
  1: {
    targetRatio: 1,
    targetError: 0,
  },
  2: {
    targetRatio: 0.5,
    targetError: 0.01,
  },
  4: {
    targetRatio: 0.3,
    targetError: 0.05,
  },
  8: {
    targetRatio: 0.15,
    targetError: 0.1,
  },
};
const maxNumGeometries = 16;
const maxInstancesPerGeometryPerDrawCall = 256;
const maxDrawCallsPerGeometry = 256;

//

export class LitterMetaMesh extends THREE.Object3D {
  constructor({
    instance,
    // gpuTaskManager,
    physics,
  }) {
    super();

    this.polygonMesh = new PolygonMesh({
      instance,
      lodCutoff: spriteLodCutoff,
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
    });
    this.add(this.polygonMesh);

    this.spritesheetMesh = new SpritesheetMesh({
      instance,
      lodCutoff: spriteLodCutoff,
    });
    this.add(this.spritesheetMesh);

    this.physics = physics;
  }
  update() {
    this.spritesheetMesh.update();
  }
  addChunk(chunk, chunkResult) {
    this.polygonMesh.addChunk(chunk, chunkResult);
    this.spritesheetMesh.addChunk(chunk, chunkResult);
  }
  removeChunk(chunk) {
    this.polygonMesh.removeChunk(chunk);
    this.spritesheetMesh.removeChunk(chunk);
  }
  async waitForLoad() {
    const [
      polygonPackage,
      spritesheetPackage,
    ] = await Promise.all([
      PolygonPackage.loadUrls(litterUrls, meshLodSpecs, this.physics),
      SpritesheetPackage.loadUrls(litterUrls),
    ]);
    this.polygonMesh.setPackage(polygonPackage);
    this.spritesheetMesh.setPackage(spritesheetPackage);

    /* // XXX debugging
    {
      const allLodMeshes = [];
      const {lodMeshes} = polygonPackage;
      for (const lodMeshArray of lodMeshes) {
        for (const lodMesh of lodMeshArray) {
          // this.add(lodMesh);
          allLodMeshes.push(lodMesh);
        }
      }
      const meshSize = 3;
      for (let i = 0; i < allLodMeshes.length; i++) {
        const lodMesh = allLodMeshes[i];
        lodMesh.position.x = (-allLodMeshes.length/2 + i) * meshSize;
        lodMesh.position.y = 0.5;
        lodMesh.position.z = 5;
        this.add(lodMesh);
        lodMesh.updateMatrixWorld();
      }
    } */
  }
}