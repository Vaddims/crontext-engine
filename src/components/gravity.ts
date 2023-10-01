import { Transformator } from "objectra";
import { Component } from "../core";

@Transformator.Register()
export class Gravity extends Component {
  public gravitationalPull = 1; // m/s2
}