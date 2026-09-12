import { bearing, distanceKm, moveTowards, randomPointInRadius } from './gps-generator';
import { nextBattery, nextState } from './state-machine';
import type { GeoPoint, SimulatorConfig, VehicleState } from './types';

/** 到达目标的判定距离（km） */
const ARRIVAL_THRESHOLD_KM = 0.05;

/** 空闲时每秒产生新目标的概率 */
const NEW_TARGET_PROBABILITY = 0.05;

/**
 * 单车模型。
 * 封装状态、目标点、tick 逻辑，不关心 MQTT 和调度。
 */
export class Vehicle {
  readonly id: string;

  private lat: number;
  private lng: number;
  private speed: number;
  private battery: number;
  private heading: number;
  private status: VehicleState['status'];
  private target: GeoPoint | null;

  private readonly config: SimulatorConfig;

  constructor(id: string, config: SimulatorConfig) {
    this.id = id;
    this.config = config;

    const center: GeoPoint = { lat: config.centerLat, lng: config.centerLng };
    const start = randomPointInRadius(center, config.radiusKm);

    this.lat = start.lat;
    this.lng = start.lng;
    this.speed = 0;
    this.battery = 60 + Math.random() * 40;
    this.heading = Math.random() * 360;
    this.status = 'idle';
    this.target = null;
  }

  /**
   * 推进一个时间片。
   * @param tickSec 时间片长度（秒）
   * @returns 当前状态快照
   */
  tick(tickSec: number): VehicleState {
    const position: GeoPoint = { lat: this.lat, lng: this.lng };
    const reachedTarget = this.target !== null && distanceKm(position, this.target) < ARRIVAL_THRESHOLD_KM;

    const nextStatus = nextState({
      status: this.status,
      battery: this.battery,
      hasTarget: this.target !== null,
      reachedTarget,
    });

    if (nextStatus === 'running' && this.target) {
      const targetSpeed =
        this.config.minSpeed + Math.random() * (this.config.maxSpeed - this.config.minSpeed);
      const distanceInTick = (targetSpeed / 3600) * tickSec;
      const nextPosition = moveTowards(position, this.target, distanceInTick);

      this.lat = nextPosition.lat;
      this.lng = nextPosition.lng;
      this.speed = targetSpeed;
      this.heading = bearing(nextPosition, this.target);
    } else {
      this.speed = 0;
    }

    if (nextStatus === 'idle') {
      if (reachedTarget || this.target === null) {
        this.target = null;
        if (Math.random() < NEW_TARGET_PROBABILITY) {
          this.target = randomPointInRadius(
            { lat: this.config.centerLat, lng: this.config.centerLng },
            this.config.radiusKm,
          );
        }
      }
    }

    this.battery = nextBattery(this.battery, nextStatus, tickSec);
    this.status = nextStatus;

    return this.getState();
  }

  /**
   * 返回状态快照。
   */
  getState(): VehicleState {
    return {
      vehicle_id: this.id,
      ts: Date.now(),
      lat: this.lat,
      lng: this.lng,
      speed: this.speed,
      battery: this.battery,
      heading: this.heading,
      status: this.status,
    };
  }
}