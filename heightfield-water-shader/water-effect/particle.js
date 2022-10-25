import metaversefile from 'metaversefile';
import * as THREE from 'three';
import {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
  getDroplet,
  getMovingRipple,
  getMovingSplash,
  getFreestyleSplash,
  getBubble,
  getBodyDrop,
} from './mesh.js';

const {useSound, useInternals} = metaversefile;
const sounds = useSound();
const soundFiles = sounds.getSoundFiles();

// constants
const regex = new RegExp('^water/jump_water[0-9]*.wav$');
const divingCandidateAudios = soundFiles.water.filter((f) => regex.test(f.name));
const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localVector6 = new THREE.Vector3();
const rotateY = new THREE.Quaternion();
rotateY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

class WaterParticleEffect {
  constructor(mirrorInvisibleList) {
    this.mirrorInvisibleList = mirrorInvisibleList;
    this.scene = useInternals().sceneLowPriority;
    this.camera = useInternals().camera;
    this.contactWater = false;
    this.lastContactWater = false;
    this.player = null;
    this.waterSurfaceHeight = 0;
    this.divingCollisionPos = new THREE.Vector3();

    this.rippleMesh = null;
    this.rippleGroup = null;
    this.initRipple();

    this.divingLowerSplash = null;
    this.initDivingLowerSplash();

    this.divingHigherSplash = null;
    this.initDivingHigherSplash();

    this.dropletgroup = null;
    this.droplet = null;
    this.dropletRipple = null;
    this.initDroplet();

    this.movingRipple = null;
    this.lastStaticTime = 0;
    this.initMovingRipple();

    this.movingSplash = null;
    this.lastMovingSplashEmitTime = 0;
    this.movingSplashGroup = null;
    this.lastSwimmingHand = null;
    this.initMovingSplash();

    this.freestyleSplash = null;
    this.freestyleSplashGroup = null;
    this.initfreestyleSplash();

    this.bubble = null;
    this.initBubble();

    this.bodyDrop = null;
    this.bodyDropGroup = null;
    this.initbodyDrop();
  }

  playDivingSfx() {
    const audioSpec = divingCandidateAudios[Math.floor(Math.random() * divingCandidateAudios.length)];
    sounds.playSound(audioSpec);
  }

  playDivingRipple() {
    this.rippleMesh.visible = true;
    this.rippleGroup.position.copy(this.divingCollisionPos);
    this.rippleMesh.material.uniforms.vBroken.value = 0.1;
    this.rippleMesh.scale.set(0.25, 1, 0.25);
    this.rippleMesh.material.uniforms.uTime.value = 120;
  }

  updateDivingRipple() {
    if (this.rippleMesh) {
      const falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
      if (this.rippleMesh.material.uniforms.vBroken.value < 1) {
        if (this.rippleMesh.scale.x > 0.15 * (1 + falling * 0.1)) {
          this.rippleMesh.material.uniforms.vBroken.value *= 1.025;
        }
        this.rippleMesh.scale.x += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.scale.z += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.material.uniforms.uTime.value += 0.015;
      }
      else {
        this.rippleMesh.visible = false;
      }
    }
    else {
      if (this.rippleGroup.children.length > 0) {
        if (this.rippleGroup.children[0].children.length > 0) {
          this.rippleMesh = this.rippleGroup.children[0].children[0];
        }
      }
    }
  }

  playDivingLowerSplash() {
    const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
    const textureRotationAttribute = this.divingLowerSplash.geometry.getAttribute('textureRotation');
    const particleCount = this.divingLowerSplash.info.particleCount;
    for (let i = 0; i < particleCount; i ++) {
      this.divingLowerSplash.info.velocity[i].x = Math.sin(i) * .055 + (Math.random() - 0.5) * 0.001;
      this.divingLowerSplash.info.velocity[i].y = 0.12 + 0.01 * Math.random();
      this.divingLowerSplash.info.velocity[i].z = Math.cos(i) * .055 + (Math.random() - 0.5) * 0.001;
      positionsAttribute.setXYZ(  
        i, 
        this.divingCollisionPos.x + this.divingLowerSplash.info.velocity[i].x,
        this.divingCollisionPos.y + 0.1 * Math.random(),
        this.divingCollisionPos.z + this.divingLowerSplash.info.velocity[i].z
      );
      this.divingLowerSplash.info.velocity[i].divideScalar(5);
      scalesAttribute.setX(i, 0.6);
      textureRotationAttribute.setX(i, Math.random() * 2);
      brokenAttribute.setX(i, 0.2);
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    textureRotationAttribute.needsUpdate = true;
  }

  updateDivingLowerSplash() {
    if (this.divingLowerSplash) { 
      const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
      const particleCount = this.divingLowerSplash.info.particleCount;
      for (let i = 0; i < particleCount; i ++) {
        if (scalesAttribute.getX(i) >= 0.6 && scalesAttribute.getX(i) < 2.1) {
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.2);
        }
        if (scalesAttribute.getX(i) >= 2.1) {
          if (brokenAttribute.getX(i) < 1) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.015);
            positionsAttribute.setXYZ(  
              i, 
              positionsAttribute.getX(i) + this.divingLowerSplash.info.velocity[i].x,
              positionsAttribute.getY(i) + this.divingLowerSplash.info.velocity[i].y,
              positionsAttribute.getZ(i) + this.divingLowerSplash.info.velocity[i].z
            );
            this.divingLowerSplash.info.velocity[i].add(this.divingLowerSplash.info.acc);
          }
        }
      }
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      this.divingLowerSplash.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
      this.divingLowerSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }

  playDivingHigherSplash() {
    const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
    const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
    const particleCount = this.divingHigherSplash.info.particleCount;
    for (let i = 0; i < particleCount; i ++) {
      this.divingHigherSplash.info.velocity[i].y = 0.08 + 0.035 * Math.random();
      brokenAttribute.setX(i, 0.2 + Math.random() * 0.1);
      scalesAttribute.setX(i, 0.5 + Math.random() * 0.5);
      const theta = 2. * Math.PI * i / particleCount;
      positionsAttribute.setXYZ(
        i,
        this.divingCollisionPos.x + Math.sin(theta) * 0.03,
        this.divingCollisionPos.y - 1.5,
        this.divingCollisionPos.z + Math.cos(theta) * 0.03
      ) 
      const n = Math.cos(theta) > 0 ? 1 : -1;
      rotationAttribute.setXYZ(i, -Math.sin(theta) * n * (Math.PI / 2)); 
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    rotationAttribute.needsUpdate = true;
  }

  updateDivingHigherSplash() {
    if (this.divingHigherSplash) { 
      const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
      const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
      const particleCount = this.divingHigherSplash.info.particleCount;
      for (let i = 0; i < particleCount; i ++) {
        if (brokenAttribute.getX(i) < 1) {
          if (positionsAttribute.getY(i) >= this.divingCollisionPos.y - 0.7 && scalesAttribute.getX(i) > 0) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) * 1.03);
            scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.02);
            positionsAttribute.setY(i, positionsAttribute.getY(i) + this.divingHigherSplash.info.velocity[i].y);
            this.divingHigherSplash.info.velocity[i].add(this.divingHigherSplash.info.acc);
          }
          else {
            positionsAttribute.setY(i, positionsAttribute.getY(i) + 0.08);
          } 
        }
      }
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      rotationAttribute.needsUpdate = true;
      this.divingHigherSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }

  playDroplet() {
    const positionsAttribute = this.droplet.geometry.getAttribute('positions');
    const scalesAttribute = this.droplet.geometry.getAttribute('scales');
    const particleCount = this.droplet.info.particleCount;
    let falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
    let dropletNum = particleCount * (falling / 10);
    dropletNum /= 3;
    falling = falling < 5 ? 7 : falling;
    for (let i = 0; i < particleCount; i ++) {
      let rand = Math.random();
      scalesAttribute.setX(i, rand);
      positionsAttribute.setXYZ(i, 0, 0, 0);
      
      this.droplet.info.velocity[i].x = (Math.random() - 0.5) * 1 * (falling / 10);
      this.droplet.info.velocity[i].y = Math.random() * 1.4 * (falling / 10);
      this.droplet.info.velocity[i].z = (Math.random() - 0.5) * 1 * (falling / 10);
      this.droplet.info.velocity[i].divideScalar(20);
      
      this.droplet.info.alreadyHaveRipple[i] = false;

      if (i > dropletNum) {
        scalesAttribute.setX(i, 0.001);
      }
      this.droplet.info.offset[i] = Math.floor(Math.random() * 29);
      this.droplet.info.startTime[i] = 0;
    }
    this.dropletgroup.position.copy(this.divingCollisionPos);
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
  }

  updateDroplet(timestamp) {
    if (this.droplet && this.dropletRipple) { 
      const rippleBrokenAttribute = this.dropletRipple.geometry.getAttribute('broken');
      const rippleWaveFreqAttribute = this.dropletRipple.geometry.getAttribute('waveFreq');
      const ripplePositionsAttribute = this.dropletRipple.geometry.getAttribute('positions');
      const rippleScalesAttribute = this.dropletRipple.geometry.getAttribute('scales');
      
      const offsetAttribute = this.droplet.geometry.getAttribute('offset');
      const positionsAttribute = this.droplet.geometry.getAttribute('positions');
      const scalesAttribute = this.droplet.geometry.getAttribute('scales');
      const particleCount = this.droplet.info.particleCount;
      for (let i = 0; i < particleCount; i ++) {
        if (positionsAttribute.getY(i) >= this.waterSurfaceHeight) {
          this.droplet.info.velocity[i].add(this.droplet.info.acc);
          scalesAttribute.setX(i, scalesAttribute.getX(i) / 1.035);
          positionsAttribute.setXYZ(
            i,
            positionsAttribute.getX(i) + this.droplet.info.velocity[i].x,
            positionsAttribute.getY(i) + this.droplet.info.velocity[i].y,
            positionsAttribute.getZ(i) + this.droplet.info.velocity[i].z
          )
          this.droplet.info.startTime[i] = this.droplet.info.startTime[i] + 1;
          if (this.droplet.info.startTime[i] % 2 === 0)
            this.droplet.info.offset[i] += 1;
          if (this.droplet.info.offset[i] >= 30) {
            this.droplet.info.offset[i] = 0;
          }
          offsetAttribute.setXY(i, (5 / 6) - Math.floor(this.droplet.info.offset[i] / 6) * (1. / 6.), Math.floor(this.droplet.info.offset[i] % 5) * 0.2);
        }
        else {
          if (!this.droplet.info.alreadyHaveRipple[i] && scalesAttribute.getX(i) > 0.001) {
            scalesAttribute.setX(i, 0.0001);
            ripplePositionsAttribute.setXYZ(i, positionsAttribute.getX(i), 0.01, positionsAttribute.getZ(i));
            rippleScalesAttribute.setX(i, Math.random() * 0.2);
            rippleWaveFreqAttribute.setX(i, Math.random() * (i % 10));
            rippleBrokenAttribute.setX(i, Math.random() - 0.8);
            this.droplet.info.alreadyHaveRipple[i] = true;
          }
        }
        
        if (rippleBrokenAttribute.getX(i) < 1) {
          rippleScalesAttribute.setX(i, rippleScalesAttribute.getX(i) + 0.02);
          rippleBrokenAttribute.setX(i, rippleBrokenAttribute.getX(i) + 0.02);
        }
      }
      offsetAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;

      ripplePositionsAttribute.needsUpdate = true;
      rippleScalesAttribute.needsUpdate = true;
      rippleBrokenAttribute.needsUpdate = true;
      rippleWaveFreqAttribute.needsUpdate = true;

      this.dropletRipple.material.uniforms.uTime.value = timestamp / 1000;
      this.droplet.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
    }
  }
  playMovingRipple(timestamp) {
    if (this.currentSpeed < 0.1) {
      return;
    }
    
    const particleCount = this.movingRipple.info.particleCount;
    const brokenAttribute = this.movingRipple.geometry.getAttribute('broken');
    const positionsAttribute = this.movingRipple.geometry.getAttribute('positions');
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    const playerRotationAttribute = this.movingRipple.geometry.getAttribute('playerRotation');
    const randAttribute = this.movingRipple.geometry.getAttribute('random');

    const emitThreshold = 170 * Math.pow((1.1 - this.currentSpeed), 0.3);

    if (timestamp - this.movingRipple.info.lastEmmitTime > emitThreshold) {
      const particleRot = this.player.rotation.x !== 0 ?  Math.PI + this.player.rotation.y : -this.player.rotation.y;
      playerRotationAttribute.setX(this.movingRipple.info.currentCircleRipple, particleRot);
      
      // play circle ripple
      brokenAttribute.setX(this.movingRipple.info.currentCircleRipple, 0.03 * Math.random());
      scalesAttribute.setX(this.movingRipple.info.currentCircleRipple, 1.5 + Math.random() * 0.1);
      positionsAttribute.setXYZ(
        this.movingRipple.info.currentCircleRipple,
        this.player.position.x + 0.25 * this.playerDir.x + (Math.random() - 0.5) * 0.1, 
        this.waterSurfaceHeight + 0.01, 
        this.player.position.z + 0.25 * this.playerDir.z + (Math.random() - 0.5) * 0.1
      );
      
      // if speed > 0.3, play broken ripple
      if (this.currentSpeed > 0.3) {
        brokenAttribute.setX(this.movingRipple.info.currentBrokenRipple, 0.1 + 0.2 * Math.random());
        scalesAttribute.setX(this.movingRipple.info.currentBrokenRipple, 1.1 + Math.random() * 0.5);
        positionsAttribute.setXYZ(
          this.movingRipple.info.currentBrokenRipple,
          this.player.position.x - 0.25 * this.playerDir.x + (Math.random() - 0.5) * 0.25, 
          this.waterSurfaceHeight + 0.01, 
          this.player.position.z - 0.25 * this.playerDir.z + (Math.random() - 0.5) * 0.25
        );
        
      }
      else {
        scalesAttribute.setX(this.movingRipple.info.currentBrokenRipple, 0);
      }

      randAttribute.setX(this.movingRipple.info.currentCircleRipple, Math.random());
      randAttribute.setX(this.movingRipple.info.currentBrokenRipple, Math.random());
      this.movingRipple.info.currentCircleRipple ++;
      this.movingRipple.info.currentBrokenRipple ++;
      this.movingRipple.info.lastEmmitTime = timestamp;

      // reset index
      const lastIndexOfCircleRipple = (particleCount - 1) / 2;
      if(this.movingRipple.info.currentCircleRipple >= lastIndexOfCircleRipple){
        this.movingRipple.info.currentCircleRipple = 0;
      }
      if(this.movingRipple.info.currentBrokenRipple >= particleCount - 1){
        this.movingRipple.info.currentBrokenRipple = lastIndexOfCircleRipple;
      }
    }
    
    positionsAttribute.needsUpdate = true;
    randAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    brokenAttribute.needsUpdate = true;
    playerRotationAttribute.needsUpdate = true;  
  }

  enableStaticRipple() {
    const indexOfStaticRipple = this.movingRipple.info.particleCount - 1;
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    if (scalesAttribute.getX(indexOfStaticRipple) < 3.5) {
      scalesAttribute.setX(indexOfStaticRipple, 3.5);
      this.movingRipple.material.uniforms.op.value = 0.1;
    }
    scalesAttribute.needsUpdate = true;
  }

  disableStaticRipple() {
    const indexOfStaticRipple = this.movingRipple.info.particleCount - 1;
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    scalesAttribute.setX(indexOfStaticRipple, 0.0);
    scalesAttribute.needsUpdate = true;
  }

  updateMovingRipple(timestamp) {
    if (this.movingRipple) {
      const particleCount = this.movingRipple.info.particleCount;
      const brokenAttribute = this.movingRipple.geometry.getAttribute('broken');
      const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
      const positionsAttribute = this.movingRipple.geometry.getAttribute('positions');
      
      for (let i = 0; i < particleCount - 1; i++) {
        if (brokenAttribute.getX(i) < 1) {
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.1 * (this.currentSpeed + 0.3));
          brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.01);
        }
      }
      // for static ripple
      positionsAttribute.setXYZ(
        particleCount - 1,
        this.player.position.x + 0.1 * this.playerDir.x, 
        this.waterSurfaceHeight + 0.01, 
        this.player.position.z + 0.1 * this.playerDir.z
      );
      if (this.movingRipple.material.uniforms.op.value < 1.) {
        this.movingRipple.material.uniforms.op.value += 0.01;
      }
  
      scalesAttribute.needsUpdate = true;
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      this.movingRipple.material.uniforms.uTime.value = timestamp / 1000;
    }  
  }

  playMovingSplash(px, py, pz, maxEmmit, scale, velocity, acc, brokenVelocity) {
    let count = 0;
    const particleCount = this.movingSplash.info.particleCount;
    const positionsAttribute = this.movingSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.movingSplash.geometry.getAttribute('scales');
    const brokenAttribute = this.movingSplash.geometry.getAttribute('broken');
    const textureRotationAttribute = this.movingSplash.geometry.getAttribute('textureRotation');
    for (let i = 0; i < particleCount; i++) {
      if (brokenAttribute.getX(i) >= 1) {
        this.movingSplash.info.velocity[i].set(velocity.x, velocity.y, velocity.z);
        this.movingSplash.info.acc[i].set(acc.x, acc.y, acc.z);
        scalesAttribute.setX(i, (1 + Math.random()) * scale);
        brokenAttribute.setX(i, Math.random() * 0.1);
        textureRotationAttribute.setX(i, Math.random() * 2);
        positionsAttribute.setXYZ(  
          i, 
          px + (Math.random() - 0.5) * 0.02,
          py + (Math.random() - 0.5) * 0.02,
          pz + (Math.random() - 0.5) * 0.02
        );
        this.movingSplash.info.brokenVelocity[i] = brokenVelocity;
        brokenAttribute.setX(i, 0.2 + Math.random() * 0.15);
        count ++;
      }
      if (count >= maxEmmit) {
        break;
      }
    }
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    brokenAttribute.needsUpdate = true;
    textureRotationAttribute.needsUpdate = true;
  }

  updateMovingSplash() {
    this.movingSplashGroup.position.copy(this.player.position);
    this.movingSplashGroup.position.y = this.waterSurfaceHeight;
    if (this.movingSplash) {
      const particleCount = this.movingSplash.info.particleCount;
      const positionsAttribute = this.movingSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.movingSplash.geometry.getAttribute('scales');
      const brokenAttribute = this.movingSplash.geometry.getAttribute('broken');
      for (let i = 0; i < particleCount; i++) {
        if (brokenAttribute.getX(i) < 1) {
          const stopMoving = this.currentSpeed <= 0.1
          const brokenAcc = 0.015 * this.movingSplash.info.brokenVelocity[i];
          brokenAttribute.setX(i, brokenAttribute.getX(i) + brokenAcc);
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.05);
          if (!stopMoving) {
            positionsAttribute.setXYZ(  
              i, 
              positionsAttribute.getX(i) + - this.playerDir.x * this.movingSplash.info.velocity[i].x,
              positionsAttribute.getY(i) + this.movingSplash.info.velocity[i].y,
              positionsAttribute.getZ(i) + - this.playerDir.z * this.movingSplash.info.velocity[i].z
            );
          }
          this.movingSplash.info.velocity[i].add(this.movingSplash.info.acc[i]);
        }
        else {
          scalesAttribute.setX(i, 0);
        }
      }
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      brokenAttribute.needsUpdate = true;
      
      this.movingSplash.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
      this.movingSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }

  playFreestyleSplash() {
    const particleCount = this.freestyleSplash.info.particleCount;
    const positionsAttribute = this.freestyleSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.freestyleSplash.geometry.getAttribute('scales');
    const brokenAttribute = this.freestyleSplash.geometry.getAttribute('broken');
    const rotationAttribute = this.freestyleSplash.geometry.getAttribute('rotation');
    let emitCount = 0;
    let maxEmit = 1;
    const dirRandom = (Math.random() - 0.5) * 0.1;
    for (let i = 0; i < particleCount; i ++) {
      if (brokenAttribute.getX(i) >= 1 || brokenAttribute.getX(i) <= 0) {
        const right = this.player.avatarCharacterSfx.currentSwimmingHand === 'right' ? 1 : -1;
        const rand = 0.28;
        const rand2 = 0.75;
        this.freestyleSplash.info.initialScale[i].set(rand, rand2, rand); 
        scalesAttribute.setXYZ(i, rand, rand2, rand);
        positionsAttribute.setXYZ(
          i,
          0.3 * right + dirRandom,
          0.7 + dirRandom,
          0.
        )
        rotationAttribute.setX(i, Math.random() * 2 * Math.PI);
        brokenAttribute.setX(i, Math.random() * 0.15);
        emitCount ++;
      }
      if (emitCount >= maxEmit) {
        break;
      }
    }
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    brokenAttribute.needsUpdate = true;
    rotationAttribute.needsUpdate = true;
  }

  updateFreestyleSplash() {
    if (this.freestyleSplash) {
      this.freestyleSplashGroup.position.copy(this.player.position);
      this.freestyleSplashGroup.position.y = 0.29;
      this.freestyleSplashGroup.rotation.copy(this.player.rotation);

      const particleCount = this.freestyleSplash.info.particleCount;
      const positionsAttribute = this.freestyleSplash.geometry.getAttribute('positions');
      const brokenAttribute = this.freestyleSplash.geometry.getAttribute('broken');
      const scalesAttribute = this.freestyleSplash.geometry.getAttribute('scales');
      for (let i = 0; i < particleCount; i ++) {
        if (brokenAttribute.getX(i) < 1) {
          if ( scalesAttribute.getY(i) > this.freestyleSplash.info.initialScale[i].y * 1.5) {
            scalesAttribute.setXYZ(
              i, 
              scalesAttribute.getX(i) * 1.03, 
              scalesAttribute.getY(i) * 1.04, 
              scalesAttribute.getZ(i) * 1.03
            )
            positionsAttribute.setY(i, positionsAttribute.getY(i) - 0.008);
            positionsAttribute.setZ(i, positionsAttribute.getZ(i) + 0.003);
            brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.04);
          }
          else {
            scalesAttribute.setXYZ(
              i, 
              scalesAttribute.getX(i) * 1.1, 
              scalesAttribute.getY(i) * 1.15, 
              scalesAttribute.getZ(i) * 1.1
            )
          }
        }
      }
      scalesAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      brokenAttribute.needsUpdate = true;
      this.freestyleSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
    else {
      if (this.freestyleSplashGroup.children.length > 0 && this.freestyleSplashGroup.children[0].children.length) {
        this.freestyleSplash = this.freestyleSplashGroup.children[0].children[0];
      }
    }
  }

  handleSwimmingSplash(timestamp, animationType) {
    if (this.currentSpeed < 0.1) {
      return;
    }
    
    const currentSwimmingHand = this.player.avatarCharacterSfx.currentSwimmingHand;
    const playerQ = localVector4.set(this.playerDir.x, this.playerDir.y, this.playerDir.z).applyQuaternion(rotateY);
    
    if (currentSwimmingHand && this.lastSwimmingHand !== currentSwimmingHand) {
      const acc = localVector5.set(0, -0.001, 0);
      const velocity = localVector6.set(0.03, 0.015, 0.03);
      if (animationType === 'breaststroke') {
        // emit splash on both hand
        this.playMovingSplash(
          this.playerDir.x * 0.5 + playerQ.x * 0.2, 
          0, 
          this.playerDir.z * 0.5 + playerQ.z * 0.2,
          5,
          1 + Math.random() * 0.2,
          velocity,
          acc, 
          1.3
        );
        this.playMovingSplash(
          this.playerDir.x * 0.5 + playerQ.x * -0.2, 
          0, 
          this.playerDir.z * 0.5 + playerQ.z * -0.2,
          5,
          1 + Math.random() * 0.2,
          velocity,
          acc, 
          1.3
        );
      }
      else if (animationType === 'freestyle') {
        // emit splash on swimming hand
        const right = currentSwimmingHand === 'right' ? 1 : -1;
        this.playMovingSplash(
          this.playerDir.x * 0.5 + playerQ.x * 0.25 * right, 
          - 0.03, 
          this.playerDir.z * 0.5 + playerQ.z * 0.25 * right,
          5,
          1.3 + Math.random() * 0.2,
          velocity,
          acc, 
          1.5
        );
        // emit freestyle splash on swimming hand
        this.playFreestyleSplash();
      } 
    }
    this.lastSwimmingHand = currentSwimmingHand; 

    if (timestamp - this.lastMovingSplashEmitTime > 30 && currentSwimmingHand) {
      const rightScale = animationType === 'freestyle' 
                  ? (currentSwimmingHand === 'right' ? 1.2 + Math.random() * 0.2 : 0.8 + Math.random() * 0.2)
                  : 1.5 * this.currentSpeed + Math.random() * 0.2;
      const leftScale = animationType === 'freestyle' 
                  ? (currentSwimmingHand === 'right' ? 0.8 + Math.random() * 0.2 : 1.2 + Math.random() * 0.2)
                  : 1.5 * this.currentSpeed + Math.random() * 0.2;
      const acc = localVector5.set(0, 0, 0);
      const speed = animationType === 'freestyle' ? 0.06 : 0.04;
      const velocity = localVector6.set(speed, -0.001, speed);
      this.playMovingSplash(
        this.playerDir.x * 0.35 + (Math.random() - 0.5) * 0.1 + playerQ.x * 0.15, 
        -0.03, 
        this.playerDir.z * 0.35 + (Math.random() - 0.5) * 0.1 + playerQ.z * 0.15,
        1,
        rightScale + Math.random() * 0.2,
        velocity,
        acc,
        1
      );
      this.playMovingSplash(
        this.playerDir.x * 0.35 + (Math.random() - 0.5) * 0.1 + playerQ.x * -0.15, 
        -0.03, 
        this.playerDir.z * 0.35 + (Math.random() - 0.5) * 0.1 + playerQ.z * -0.15,
        1,
        leftScale + Math.random() * 0.2,
        velocity,
        acc,
        1
      );
      this.lastMovingSplashEmitTime = timestamp;
    }
  }
  handleWalkingSplash() {
    const maxRunningSpeed = 0.8;
    const currentStep = this.player.avatarCharacterSfx.currentStep;
    if (currentStep && this.lastStep !== currentStep) {
      const playerQ = localVector4.set(this.playerDir.x, this.playerDir.y, this.playerDir.z).applyQuaternion(rotateY);
      const isRight = currentStep === 'right' ? 1 : -1;
      const d = (maxRunningSpeed - this.currentSpeed) * 10;
      const acc = localVector5.set(0, -0.0022, 0);
      const velocity = localVector6.set(0.02 / d, 0.03 + Math.random() * 0.01, 0.02 / d);
      const scale = 0.5 + this.currentSpeed + Math.random() * 0.2;
      this.playMovingSplash(
        this.playerDir.x * 0.15 + playerQ.x * 0.1 * isRight, 
        -0.23, 
        this.playerDir.z * 0.15 + playerQ.z * 0.1 * isRight,
        3,
        scale,
        velocity,
        acc, 
        1.2
      );
    }
    
    this.lastStep = currentStep;
  }
  
  playBubble(timestamp) {
    const positionsAttribute = this.bubble.geometry.getAttribute('positions');
    const scalesAttribute = this.bubble.geometry.getAttribute('scales');
    if (timestamp - this.bubble.info.lastEmmitTime > 100) {
      const maxEmit = (Math.floor(this.currentSpeed * 10 + 1) * 5);
      for (let i = 0; i < maxEmit; i ++) {
        localVector3.set(this.player.position.x, this.player.position.y, this.player.position.z);
        if (scalesAttribute.getX(i) <= 0) {
          if (this.currentSpeed > 0.1) {
            localVector3.x += (Math.random() - 0.5) * 0.5;
            localVector3.y += -0.2 - (Math.random()) * 0.5;
            localVector3.z += (Math.random() - 0.5) * 0.5;
            this.bubble.info.velocity[i].x = -this.playerDir.x * 0.005;
            this.bubble.info.velocity[i].y = 0.0025 + Math.random() * 0.0025;
            this.bubble.info.velocity[i].z = -this.playerDir.z * 0.005;
          }
          else { // when stop moving
            localVector3.x += -this.playerDir.x * 0.25 + (Math.random() - 0.5) * 0.5;
            localVector3.z += -this.playerDir.z * 0.25 + (Math.random() - 0.5) * 0.5;
            const avatarHeight = this.player.avatar ? this.player.avatar.height : 0;
            localVector3.y -= avatarHeight * 0.6 + (Math.random()) * 0.2;
            this.bubble.info.velocity[i].x = 0;
            this.bubble.info.velocity[i].y = 0.0025 + Math.random() * 0.0025;
            this.bubble.info.velocity[i].z = 0;
          }
          if (localVector3.y > this.waterSurfaceHeight) // avoid bubble fly above water
            localVector3.y = this.waterSurfaceHeight;
          positionsAttribute.setXYZ(i, localVector3.x, localVector3.y, localVector3.z);
          
          this.bubble.info.offset[i] = Math.floor(Math.random() * 29);
          this.bubble.info.maxLife[i] = (50 + Math.random() * 50);
          this.bubble.info.livingTime[i] = 0;
          scalesAttribute.setX(i, Math.random());
        }
      }
    }
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
  }

  updateBubble() {
    if (this.bubble) {
      const particleCount = this.bubble.info.particleCount;
      const offsetAttribute = this.bubble.geometry.getAttribute('offset');
      const positionsAttribute = this.bubble.geometry.getAttribute('positions');
      const scalesAttribute = this.bubble.geometry.getAttribute('scales');
      for (let i = 0; i < particleCount; i++) {
        if (scalesAttribute.getX(i) > 0) {
          if (positionsAttribute.getY(i) >= this.waterSurfaceHeight) {
            this.bubble.info.velocity[i].y = 0;
          }
          positionsAttribute.setXYZ(  
            i, 
            positionsAttribute.getX(i) + this.bubble.info.velocity[i].x,
            positionsAttribute.getY(i) + this.bubble.info.velocity[i].y,
            positionsAttribute.getZ(i) + this.bubble.info.velocity[i].z
          );

          // handle texture offset
          this.bubble.info.livingTime[i] ++;
          if (this.bubble.info.livingTime[i] % 2 === 0)
            this.bubble.info.offset[i] ++;
          if (this.bubble.info.offset[i] >= 30)
            this.bubble.info.offset[i] = 0;
          offsetAttribute.setXY(i, (5 / 6) - Math.floor(this.bubble.info.offset[i] / 6) * (1. / 6.), Math.floor(this.bubble.info.offset[i] % 5) * 0.2);

          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.01);
          if (this.bubble.info.livingTime[i] > this.bubble.info.maxLife[i]) {
            scalesAttribute.setX(i, 0);
          }
        }
      }
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      offsetAttribute.needsUpdate = true;
      this.bubble.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
    }
  }

  playBodyDrop() {
    const particleCount = this.bodyDrop.info.particleCount;
    const positionsAttribute = this.bodyDrop.geometry.getAttribute('positions');
    const scalesAttribute = this.bodyDrop.geometry.getAttribute('scales');
    const brokenAttribute = this.bodyDrop.geometry.getAttribute('broken');
    const opacityAttribute = this.bodyDrop.geometry.getAttribute('opacity');
    const maxEmit = 1;
    let count = 0;
    for (let i = 0; i < particleCount; i ++) {
      if (i < this.bodyDrop.info.dropCount) { // handle drop
        if (opacityAttribute.getX(i) <= 0) {
          positionsAttribute.setXYZ(
            i,
            (Math.random() - 0.5) * 0.3,
            -0.25 - Math.random() * 0.3,
            (Math.random() - 0.5) * 0.3
          )
          opacityAttribute.setX(i, Math.random() * 0.5);
          scalesAttribute.setXYZ(i, 1, 3 + Math.random() * 2, 1);
          count ++;
        }
      }
      else { // handle splash
        if (brokenAttribute.getX(i) >= 1) {
          positionsAttribute.setXYZ(
            i,
            (Math.random() - 0.5) * 0.25,
            -0.3 - Math.random() * 0.6,
            (Math.random() - 0.5) * 0.25
          )
          brokenAttribute.setX(i, 0.35 + 0.5 * Math.random());
          scalesAttribute.setXYZ(
            i, 
            4.5 + Math.random() * 4.5, 
            4.5 + Math.random() * 4.5,  
            4.5 + Math.random() * 4.5
          );
          count ++;
        }
      }
      if (count >= maxEmit) {
        break;
      }
      
    }
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    brokenAttribute.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
  }

  updateBodyDrop(timestamp) {
    if (this.bodyDrop) {
      if (this.contactWater) {
        this.bodyDrop.info.lastContactWater = timestamp;
      }
      this.bodyDropGroup.position.copy(this.player.position);
      const particleCount = this.bodyDrop.info.particleCount;
      const positionsAttribute = this.bodyDrop.geometry.getAttribute('positions');
      const scalesAttribute = this.bodyDrop.geometry.getAttribute('scales');
      const brokenAttribute = this.bodyDrop.geometry.getAttribute('broken');
      const opacityAttribute = this.bodyDrop.geometry.getAttribute('opacity');
      for (let i = 0; i < particleCount; i ++) {
        if (i < this.bodyDrop.info.dropCount) {
          if (opacityAttribute.getX(i) > 0) {
            opacityAttribute.setX(i, opacityAttribute.getX(i) - 0.015);
            positionsAttribute.setY(
              i,
              positionsAttribute.getY(i) - 0.018
            )
            scalesAttribute.setXYZ(i, 1, scalesAttribute.getY(i) * 1.03, 1);
          }
        }
        else {
          if (brokenAttribute.getX(i) < 1) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.0085);
            scalesAttribute.setXYZ(
              i,
              scalesAttribute.getX(i) * 1.03,
              scalesAttribute.getY(i) * 1.03,
              scalesAttribute.getZ(i) * 1.03
            )
          }
        }
      }
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      brokenAttribute.needsUpdate = true;
      opacityAttribute.needsUpdate = true;
      this.bodyDrop.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
    }
    else {
      if (this.bodyDropGroup.children.length > 0) {
        this.bodyDrop = this.bodyDropGroup.children[0];
      }
    }
  }
  

  update() {
    if (!this.player) {
      return;
    }
    const timestamp = performance.now();
    const swimAction = this.player.getAction('swim');
    const hasSwim = !!swimAction;

    //#################################### handle diving water ####################################
    if (this.contactWater && this.lastContactWater !== this.contactWater) {
      this.fallingSpeed = 0 - this.player.characterPhysics.velocity.y;
      this.divingCollisionPos.set(this.player.position.x, this.waterSurfaceHeight, this.player.position.z);

      // play the diving particle
      if (this.fallingSpeed > 1) {
        this.playDivingSfx();
        this.rippleMesh && this.playDivingRipple();
        this.divingLowerSplash && this.playDivingLowerSplash();
        this.divingHigherSplash && this.playDivingHigherSplash();
        this.droplet && this.dropletRipple && this.playDroplet();
      }
    }
    else {
      this.fallingSpeed = 0;
    }

    //#################################### handle moving in water ####################################
    // get player moving speed
    if (this.player.avatar) {
      this.currentSpeed = localVector.set(this.player.avatar.velocity.x, 0, this.player.avatar.velocity.z).length();
      this.currentSpeed *= 0.1;
    }
    // get player direction 
    localVector2.set(0, 0, -1);
    this.playerDir = localVector2.applyQuaternion(this.player.quaternion);
    this.playerDir.normalize();

    const swimmingAboveSurface = hasSwim && this.waterSurfaceHeight < this.player.position.y - 0.1;
    if (hasSwim) {
      if (swimmingAboveSurface) {
        this.movingRipple && this.playMovingRipple(timestamp);
        this.movingSplash && this.handleSwimmingSplash(timestamp, swimAction.animationType);
      }
      this.bubble && this.playBubble(timestamp);
    }
    else {
      const walkingInDeepWater = this.waterSurfaceHeight > this.player.position.y - this.player.avatar.height * 0.5;
      if (this.contactWater) {
        if (walkingInDeepWater) {
          this.movingRipple && this.playMovingRipple(timestamp);
        }
        else {
          this.handleWalkingSplash();
        }
      }
    }

    //#################################### handle stop moving in water ####################################
    this.lastStaticTime = (this.currentSpeed > 0.1 || this.fallingSpeed > 1) ? timestamp : this.lastStaticTime;
    if (timestamp - this.lastStaticTime > 1500 && swimmingAboveSurface) {
      this.movingRipple && this.enableStaticRipple();
    }
    else {
      this.movingRipple && this.disableStaticRipple();
    }

    //#################################### handle wet body ####################################
    if (this.bodyDrop) {
      const lastContactWaterTime = this.bodyDrop.info.lastContactWater;
      const walkInWater = this.contactWater && !hasSwim;
      const walkOnLand = timestamp - lastContactWaterTime > 100 && timestamp - lastContactWaterTime < 10000;
      const playParticle = walkInWater || walkOnLand;
      playParticle && this.playBodyDrop();
    }
    
   
    // update particle
    this.updateDivingRipple();
    this.updateDivingLowerSplash();
    this.updateDivingHigherSplash();
    this.updateDroplet(timestamp);
    this.updateMovingRipple(timestamp);
    this.updateMovingSplash();
    this.updateBubble();
    this.updateFreestyleSplash();
    this.updateBodyDrop(timestamp);
    
    this.lastContactWater = this.contactWater;
    this.scene.updateMatrixWorld();
    
  }

  //########################################################## initialize particle mesh #####################################################
  initRipple() {
    this.rippleGroup = getDivingRipple();
    this.scene.add(this.rippleGroup);
    this.mirrorInvisibleList.push(this.rippleGroup);
  }
  initDivingLowerSplash() {
    this.divingLowerSplash = getDivingLowerSplash();
    this.scene.add(this.divingLowerSplash);
    this.mirrorInvisibleList.push(this.divingLowerSplash);
  }
  initDivingHigherSplash() {
    this.divingHigherSplash = getDivingHigherSplash();
    this.scene.add(this.divingHigherSplash);
    this.mirrorInvisibleList.push(this.divingHigherSplash);
  }
  initDroplet() {
    this.dropletgroup = getDroplet();
    this.droplet = this.dropletgroup.children[0];
    this.dropletRipple = this.dropletgroup.children[1];
    this.scene.add(this.dropletgroup);
    this.mirrorInvisibleList.push(this.dropletgroup);
  }
  initMovingRipple() {
    this.movingRipple = getMovingRipple();
    this.scene.add(this.movingRipple);
    this.mirrorInvisibleList.push(this.movingRipple);
  }
  initMovingSplash() {
    this.movingSplashGroup = getMovingSplash();
    this.movingSplash = this.movingSplashGroup.children[0];
    this.scene.add(this.movingSplashGroup);
    this.mirrorInvisibleList.push(this.movingSplashGroup);
  }
  initfreestyleSplash() {
    this.freestyleSplashGroup = getFreestyleSplash();
    this.scene.add(this.freestyleSplashGroup);
    this.mirrorInvisibleList.push(this.freestyleSplashGroup);
  }
  initBubble() {
    this.bubble = getBubble();
    this.scene.add(this.bubble);
    this.mirrorInvisibleList.push(this.bubble);
  }
  initbodyDrop() {
    this.bodyDropGroup = getBodyDrop();
    this.scene.add(this.bodyDropGroup);
    this.mirrorInvisibleList.push(this.bodyDropGroup);
  }
}

export default WaterParticleEffect;