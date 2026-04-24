export class ProgressSystem {
  private current = 0;
  private total: number;

  constructor(total: number) {
    this.total = total;
  }

  advance() {
    this.current = Math.min(this.current + 1, this.total);
  }

  getProgress() {
    return { current: this.current, total: this.total };
  }

  isFinished() {
    return this.current >= this.total;
  }

  reset() {
    this.current = 0;
  }
}
