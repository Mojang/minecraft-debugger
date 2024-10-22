"use strict";
// Enum for employee roles
var Role;
(function (Role) {
    Role[Role["Developer"] = 0] = "Developer";
    Role[Role["Manager"] = 1] = "Manager";
    Role[Role["Designer"] = 2] = "Designer";
})(Role || (Role = {}));
// Generic function
function identity(arg) {
    return arg;
}
// Main class implementing the interface
class Employee {
    constructor(name, age, position, role) {
        this.name = name;
        this.age = age;
        this.position = position;
        this.role = role;
    }
    greet() {
        return `Hello, my name is ${this.name} and I am ${this.age} years old.`;
    }
    getPosition() {
        return this.position;
    }
    getRole() {
        return Role[this.role];
    }
}
// Subclass extending the main class
class Manager extends Employee {
    constructor(name, age, position, department) {
        super(name, age, position, Role.Manager);
        this.department = department;
    }
    getDepartment() {
        return this.department;
    }
}
// Class with static properties and methods
class Company {
    static addEmployee(employee) {
        this.employees.push(employee);
    }
    static getEmployeeCount() {
        return this.employees.length;
    }
}
Company.companyName = "Tech Corp";
Company.employees = [];
// Class with getters and setters
class Project {
    constructor(name, duration) {
        this._name = name;
        this._duration = duration;
    }
    get name() {
        return this._name;
    }
    set name(newName) {
        this._name = newName;
    }
    get duration() {
        return this._duration;
    }
    set duration(newDuration) {
        this._duration = newDuration;
    }
}
// Example usage
const emp1 = new Employee("Alice", 30, "Developer", Role.Developer);
const emp2 = new Manager("Bob", 40, "Manager", "IT");
Company.addEmployee(emp1);
Company.addEmployee(emp2);
console.log(emp1.greet());
console.log(emp2.getDepartment());
console.log(`Total employees: ${Company.getEmployeeCount()}`);
const project = new Project("New Website", 6);
console.log(`Project: ${project.name}, Duration: ${project.duration} months`);
project.duration = 8;
console.log(`Updated Duration: ${project.duration} months`);
// Using the generic function
const output = identity("Hello, TypeScript!");
console.log(output);
// Type assertion
let someValue = "this is a string";
let strLength = someValue.length;
console.log(`String length: ${strLength}`);
//# sourceMappingURL=main.js.map