import { Transformator } from "objectra";
import BuildinComponent from "../core/buildin-component";
import { Component, Engine } from "../core";

// export enum Scale {
//   PX = 'px',
//   Unit = 'unit',
// }

@Transformator.Register()
export class MediaRenderer extends BuildinComponent {
  public readonly url = '';

  @Transformator.Exclude()
  private loadedUrl: null | string = '';

  public readonly width = 1;
  public readonly height = 1;
  public readonly aspectRatio: null | number = null;
  public readonly referenceSize: 'px' | 'unit' = 'unit';
  public readonly referenceAxis: 'x' | 'y' = 'x';

  @Transformator.Exclude()
  private mediaLoading = true;

  public get isMediaLoading() {
    return this.mediaLoading;
  }

  @Transformator.Exclude()
  public image: HTMLImageElement = new Image();

  async syncImage() {
    if (this.loadedUrl === this.url) {
      return;
    }

    this.loadedUrl = this.url;
    const source = await Engine.fileUrlLoader(this.url);

    if (!source) {
      this.image = new Image();
      return;
    }

    this.image.onload = () => {
      this.mediaLoading = false;
    }

    this.mediaLoading = true;
    this.image.src = source;
  }

  [Component.onAwake]() {
    this.syncImage();
    // /Users/vadym.iefremov/Crontext Editor/Clear Vision Mapper/Screenshot 2024-02-28 at 23.26.15.png
  }

  [Component.onUpdate]() {
    this.syncImage();
  }
}