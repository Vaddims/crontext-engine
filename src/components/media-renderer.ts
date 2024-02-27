import { Transformator } from "objectra";
import BuildinComponent from "../core/buildin-component";
import { Component } from "../core";

// export enum Scale {
//   PX = 'px',
//   Unit = 'unit',
// }

@Transformator.Register()
export class MediaRenderer extends BuildinComponent {
  public readonly url = '';
  public readonly width = 1;
  public readonly height = 1;
  public readonly aspectRatio: null | number = null;
  public readonly referenceSize: 'px' | 'unit' = 'unit';
  public readonly referenceAxis: 'x' | 'y' = 'x';

  @Transformator.Exclude()
  public readonly image: HTMLImageElement = new Image();

  [Component.onAwake]() {
    this.image.src = this.url;
    this.image.onload = () => {
      // console.log('loaded');
    }
  }
}