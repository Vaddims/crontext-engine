import { Component } from "../core";
import { Color } from "../core/color";
import { Shape } from "../core/shape";
import { Rectangle } from "../shapes/rectangle";

export class MeshRenderer extends Component {
  public shape: Shape = new Rectangle();
  public color: Color = Color.black;

  public relativeVerticesPosition() {
    const transformedShape = this.shape.withTransform(this.transform.rotation, this.transform.scale);
    return transformedShape.vertices.map(vertex => vertex.add(this.transform.position))
  }
}
