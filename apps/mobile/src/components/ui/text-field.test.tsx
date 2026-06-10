import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { StaccatoThemeProvider } from "@/theme";
import { TextField } from "./text-field";

function renderField(props: Partial<React.ComponentProps<typeof TextField>>) {
  return render(
    <StaccatoThemeProvider>
      <TextField value="" onChangeText={() => {}} {...props} />
    </StaccatoThemeProvider>,
  );
}

describe("TextField", () => {
  it("renders the value and placeholder", () => {
    renderField({ value: "music.example.com", placeholder: "https://…" });
    expect(screen.getByDisplayValue("music.example.com")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("https://…")).toBeOnTheScreen();
  });

  it("propagates text changes", () => {
    const onChangeText = jest.fn();
    renderField({ onChangeText, placeholder: "url" });
    fireEvent.changeText(screen.getByPlaceholderText("url"), "abc");
    expect(onChangeText).toHaveBeenCalledWith("abc");
  });

  it("submits on the keyboard go/enter key", () => {
    const onSubmitEditing = jest.fn();
    renderField({ onSubmitEditing, placeholder: "url" });
    fireEvent(screen.getByPlaceholderText("url"), "submitEditing");
    expect(onSubmitEditing).toHaveBeenCalled();
  });

  it("renders a trailing slot when provided", () => {
    renderField({ trailingSlot: <Text>eye</Text> });
    expect(screen.getByText("eye")).toBeOnTheScreen();
  });

  it("hides input text when secureTextEntry is set", () => {
    renderField({ secureTextEntry: true, placeholder: "pw" });
    expect(screen.getByPlaceholderText("pw").props.secureTextEntry).toBe(true);
  });
});
