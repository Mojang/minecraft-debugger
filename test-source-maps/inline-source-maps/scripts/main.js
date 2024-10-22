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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFPQSwwQkFBMEI7QUFDMUIsSUFBSyxJQUlKO0FBSkQsV0FBSyxJQUFJO0lBQ1AseUNBQVMsQ0FBQTtJQUNULHFDQUFPLENBQUE7SUFDUCx1Q0FBUSxDQUFBO0FBQ1YsQ0FBQyxFQUpJLElBQUksS0FBSixJQUFJLFFBSVI7QUFFRCxtQkFBbUI7QUFDbkIsU0FBUyxRQUFRLENBQUksR0FBTTtJQUN6QixPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUM7QUFFRCx3Q0FBd0M7QUFDeEMsTUFBTSxRQUFRO0lBTVosWUFBWSxJQUFZLEVBQUUsR0FBVyxFQUFFLFFBQWdCLEVBQUUsSUFBVTtRQUMvRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFFRCxLQUFLO1FBQ0QsT0FBTyxxQkFBcUIsSUFBSSxDQUFDLElBQUksYUFBYSxJQUFJLENBQUMsR0FBRyxhQUFhLENBQUM7SUFDNUUsQ0FBQztJQUVELFdBQVc7UUFDUCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDekIsQ0FBQztJQUVELE9BQU87UUFDSCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0IsQ0FBQztDQUNGO0FBRUQsb0NBQW9DO0FBQ3BDLE1BQU0sT0FBUSxTQUFRLFFBQVE7SUFHNUIsWUFBWSxJQUFZLEVBQUUsR0FBVyxFQUFFLFFBQWdCLEVBQUUsVUFBa0I7UUFDdkUsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxJQUFJLENB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