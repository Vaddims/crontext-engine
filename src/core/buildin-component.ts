import { Transformator } from "objectra";
import { Component } from "./component";

@Component.Abstract()
@Component.Baseclass()
@Transformator.Register()
export default class BuildinComponent extends Component {}