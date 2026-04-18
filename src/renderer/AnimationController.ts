export type AnimationState = 'stopped' | 'playing' | 'paused';

export class AnimationController {
  private frameData: Float64Array | null = null;
  private dof = 0;
  private _currentFrame = 0;
  private _totalFrames = 0;
  private _state: AnimationState = 'stopped';
  private _speed = 1.0;
  private _accumulator = 0;
  private _framesPerSecond = 30;
  private onFrameChange: ((frame: number) => void) | null = null;

  get currentFrame(): number { return this._currentFrame; }
  get totalFrames(): number { return this._totalFrames; }
  get state(): AnimationState { return this._state; }
  get speed(): number { return this._speed; }
  set speed(v: number) { this._speed = Math.max(0.1, Math.min(10, v)); }

  setOnFrameChange(cb: (frame: number) => void): void {
    this.onFrameChange = cb;
  }

  /**
   * Load pre-computed joint states.
   * @param data Flat Float64Array, `dof` values per frame
   * @param dof Degrees of freedom per frame
   */
  load(data: Float64Array, dof: number): void {
    this.frameData = data;
    this.dof = dof;
    this._totalFrames = Math.floor(data.length / dof);
    this._currentFrame = 0;
    this._state = 'stopped';
    this._accumulator = 0;
  }

  play(): void {
    if (this._totalFrames === 0) return;
    this._state = 'playing';
  }

  pause(): void {
    this._state = 'paused';
  }

  stop(): void {
    this._state = 'stopped';
    this._currentFrame = 0;
    this._accumulator = 0;
    this.notifyFrame();
  }

  stepForward(): void {
    if (this._currentFrame < this._totalFrames - 1) {
      this._currentFrame++;
      this.notifyFrame();
    }
  }

  stepBackward(): void {
    if (this._currentFrame > 0) {
      this._currentFrame--;
      this.notifyFrame();
    }
  }

  seekTo(frame: number): void {
    this._currentFrame = Math.max(0, Math.min(frame, this._totalFrames - 1));
    this.notifyFrame();
  }

  /**
   * Called each render frame with delta time in seconds.
   */
  update(dt: number): void {
    if (this._state !== 'playing' || this._totalFrames === 0) return;

    this._accumulator += dt * this._speed * this._framesPerSecond;
    const framesToAdvance = Math.floor(this._accumulator);
    this._accumulator -= framesToAdvance;

    if (framesToAdvance > 0) {
      this._currentFrame = Math.min(
        this._currentFrame + framesToAdvance,
        this._totalFrames - 1
      );
      this.notifyFrame();

      if (this._currentFrame >= this._totalFrames - 1) {
        this._state = 'paused';
      }
    }
  }

  /**
   * Get joint state values for the current frame.
   */
  getCurrentJointState(): Float64Array | null {
    if (!this.frameData || this._totalFrames === 0) return null;
    const start = this._currentFrame * this.dof;
    return this.frameData.slice(start, start + this.dof);
  }

  private notifyFrame(): void {
    this.onFrameChange?.(this._currentFrame);
  }
}
