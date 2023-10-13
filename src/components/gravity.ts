import { Transformator } from "objectra";
import { Component } from "../core";
import BuildinComponent from "../core/buildin-component";

@Transformator.Register()
@Component.Abstract()
export class Gravity extends BuildinComponent {

  public gravitationalPull = 1; // m/s2
}